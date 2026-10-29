import type DBus from "dbus-next";
import { PlayerControlClient, type PlayerRpcEvent } from "./protocol.js";
import type { PlaybackSnapshot } from "./types.js";
import { microseconds, playbackStatus, trackPath, transportCommand } from "./mprisMapping.js";

const PATH = "/org/mpris/MediaPlayer2";
const NAME = "org.mpris.MediaPlayer2.groovenet";

/** A separate socket subscriber: no desktop code is loaded by the daemon/core. */
export async function startMpris(
  socketPath: string,
  options: {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    loadDbus?: () => Promise<typeof DBus>;
    client?: PlayerControlClient;
    onError?: (error: unknown) => void;
  } = {},
): Promise<(() => Promise<void>) | null> {
  if (
    (options.platform ?? process.platform) !== "linux" ||
    !(options.env ?? process.env).DBUS_SESSION_BUS_ADDRESS
  )
    return null;
  const dbus = await (options.loadDbus ?? (async () => (await import("dbus-next")).default))();
  const client = options.client ?? new PlayerControlClient(socketPath);
  const bus = dbus.sessionBus();
  let closed = false;
  let rejectBusFailure: (error: unknown) => void;
  const busFailure = new Promise<never>((_resolve, reject) => {
    rejectBusFailure = reject;
  });
  const close = async () => {
    if (closed) return;
    closed = true;
    client.off("event", onEvent);
    client.off("disconnect", onDisconnect);
    bus.disconnect();
    await client.close();
  };
  const fail = (error: unknown) => {
    rejectBusFailure(error);
    options.onError?.(error);
    void close();
  };
  const onDisconnect = () =>
    fail(
      new Error("Player daemon disconnected; restart groovenet-mpris after starting the daemon."),
    );
  bus.on("error", fail);
  let snapshot: PlaybackSnapshot;
  let player: PlayerInterface | undefined;
  const signaledProperties = [
    "PlaybackStatus",
    "Metadata",
    "CanPlay",
    "CanPause",
    "CanSeek",
    "CanGoNext",
    "CanGoPrevious",
  ] as const;
  const onEvent = (event: PlayerRpcEvent) => {
    // `state` includes track and position changes in one authoritative snapshot;
    // separate track-change/position events are redundant for this subscriber.
    if (event.event !== "state") return;
    const previous = player
      ? signaledProperties.map((key) => JSON.stringify(player![key], bigintJson))
      : [];
    snapshot = event.data as PlaybackSnapshot;
    if (player) {
      const changed: Record<string, unknown> = {};
      for (const [index, key] of signaledProperties.entries()) {
        const newValue = player[key];
        if (previous[index] !== JSON.stringify(newValue, bigintJson)) changed[key] = newValue;
      }
      if (Object.keys(changed).length) {
        try {
          dbus.interface.Interface.emitPropertiesChanged(player, changed, []);
        } catch (error) {
          fail(error);
        }
      }
    }
  };
  async function command(method: string, value?: number, id?: string): Promise<void> {
    const mapped = transportCommand(snapshot, method, value, id);
    if (mapped) {
      await client.request(mapped.method, mapped.params);
      if (mapped.method === "seek") player!.Seeked(microseconds(Number(mapped.params!.seconds)));
    }
  }
  class RootInterface extends dbus.interface.Interface {
    Identity = "Groovenet";
    CanQuit = false;
    CanRaise = false;
    HasTrackList = false;
    SupportedUriSchemes: string[] = [];
    SupportedMimeTypes: string[] = [];
    Raise(): void {
      /* no graphical UI */
    }
    Quit(): void {
      /* the bridge never owns daemon lifetime */
    }
  }
  class PlayerInterface extends dbus.interface.Interface {
    get PlaybackStatus() {
      return playbackStatus(snapshot);
    }
    get Position() {
      return microseconds(snapshot.current ? snapshot.position : 0);
    }
    get Metadata() {
      if (!snapshot.current) return {};
      const track = snapshot.current.track;
      const metadata: Record<string, InstanceType<typeof dbus.Variant>> = {
        "mpris:trackid": new dbus.Variant("o", trackPath(snapshot)),
        "xesam:title": new dbus.Variant("s", track.title),
        "xesam:artist": new dbus.Variant("as", [track.artist]),
        "xesam:album": new dbus.Variant("s", track.album),
      };
      if (snapshot.duration !== null)
        metadata["mpris:length"] = new dbus.Variant("x", microseconds(snapshot.duration));
      return metadata;
    }
    Rate = 1;
    MinimumRate = 1;
    MaximumRate = 1;
    CanControl = true;
    get CanPlay() {
      return snapshot.queue.length > 0;
    }
    get CanPause() {
      return snapshot.current !== null && ["playing", "paused"].includes(snapshot.status);
    }
    get CanSeek() {
      return this.CanPause;
    }
    get CanGoNext() {
      return snapshot.queue.length > 0;
    }
    get CanGoPrevious() {
      return snapshot.queue.length > 0;
    }
    Play() {
      return command("Play");
    }
    Pause() {
      return command("Pause");
    }
    PlayPause() {
      return command("PlayPause");
    }
    Stop() {
      return command("Stop");
    }
    Next() {
      return command("Next");
    }
    Previous() {
      return command("Previous");
    }
    Seek(offset: bigint) {
      return command("Seek", Number(offset));
    }
    SetPosition(id: string, position: bigint) {
      return command("SetPosition", Number(position), id);
    }
    Seeked(position: bigint) {
      return position;
    }
    OpenUri() {
      throw new dbus.DBusError(
        "org.mpris.MediaPlayer2.Error.NotSupported",
        "Enqueue tracks with groovenet player queue add.",
      );
    }
  }
  const property = (signature: string) => ({ signature, access: "read" as const });
  RootInterface.configureMembers({
    properties: {
      Identity: property("s"),
      CanQuit: property("b"),
      CanRaise: property("b"),
      HasTrackList: property("b"),
      SupportedUriSchemes: property("as"),
      SupportedMimeTypes: property("as"),
    },
    methods: { Raise: {}, Quit: {} },
  });
  PlayerInterface.configureMembers({
    properties: {
      PlaybackStatus: property("s"),
      Position: property("x"),
      Metadata: property("a{sv}"),
      Rate: property("d"),
      MinimumRate: property("d"),
      MaximumRate: property("d"),
      CanControl: property("b"),
      CanPlay: property("b"),
      CanPause: property("b"),
      CanSeek: property("b"),
      CanGoNext: property("b"),
      CanGoPrevious: property("b"),
    },
    methods: {
      Play: {},
      Pause: {},
      PlayPause: {},
      Stop: {},
      Next: {},
      Previous: {},
      Seek: { inSignature: "x" },
      SetPosition: { inSignature: "ox" },
      OpenUri: { inSignature: "s" },
    },
    signals: { Seeked: { signature: "x" } },
  });
  try {
    client.on("event", onEvent);
    client.on("disconnect", onDisconnect);
    snapshot = await Promise.race([client.request<PlaybackSnapshot>("status"), busFailure]);
    if (closed) throw new Error("Desktop bridge disconnected during startup.");
    player = new PlayerInterface("org.mpris.MediaPlayer2.Player");
    bus.export(PATH, new RootInterface("org.mpris.MediaPlayer2"));
    bus.export(PATH, player);
    const reply = await Promise.race([
      bus.requestName(NAME, dbus.NameFlag.DO_NOT_QUEUE),
      busFailure,
    ]);
    if (reply !== dbus.RequestNameReply.PRIMARY_OWNER)
      throw new Error("Another Groovenet MPRIS bridge already owns the session bus name.");
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}

function bigintJson(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
