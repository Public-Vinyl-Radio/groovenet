import { EventEmitter } from "node:events";
import dbus from "dbus-next";
import { describe, expect, it, vi } from "vitest";
import { startMpris } from "./mpris.js";
import { PlayerControlClient, type PlayerRpcEvent } from "./protocol.js";
import type { PlaybackSnapshot } from "./types.js";
import { trackPath } from "./mprisMapping.js";

const initial: PlaybackSnapshot = {
  status: "playing",
  current: {
    id: "q-1",
    track: { track_id: "a", friend_id: 1, title: "Title", artist: "Artist", album: "Album" },
  },
  queue: [],
  position: 12.5,
  duration: 120,
  volume: 100,
  error: null,
};
initial.queue = [initial.current!];

function setup(reply = dbus.RequestNameReply.PRIMARY_OWNER) {
  const bus = Object.assign(new EventEmitter(), {
    disconnect: vi.fn(),
    export: vi.fn(),
    requestName: vi.fn().mockResolvedValue(reply),
  });
  const client = new PlayerControlClient("unused");
  vi.spyOn(client, "request").mockResolvedValue(initial);
  vi.spyOn(client, "close").mockResolvedValue();
  const onError = vi.fn();
  const options = {
    platform: "linux",
    env: { DBUS_SESSION_BUS_ADDRESS: "fake" },
    client,
    onError,
    loadDbus: async () => ({ ...dbus, sessionBus: () => bus }) as unknown as typeof dbus,
  };
  const event = (data: PlaybackSnapshot, name = "state") =>
    client.emit("event", { event: name, data } as PlayerRpcEvent);
  return { bus, client, options, event, onError };
}

// Use real dbus-next interfaces/Variants and mock only the session bus connection.
describe("MPRIS socket bridge", () => {
  it("does not load desktop dependencies on unsupported platforms or headless Linux", async () => {
    const loadDbus = vi.fn();
    expect(await startMpris("unused", { platform: "darwin", loadDbus })).toBeNull();
    expect(await startMpris("unused", { platform: "linux", env: {}, loadDbus })).toBeNull();
    expect(loadDbus).not.toHaveBeenCalled();
  });

  it("exports metadata, capabilities, position and transport on the session bus", async () => {
    const { bus, client, options, event } = setup();
    const close = await startMpris("unused", options);
    expect(bus.requestName).toHaveBeenCalledWith(
      "org.mpris.MediaPlayer2.groovenet",
      dbus.NameFlag.DO_NOT_QUEUE,
    );
    const root = bus.export.mock.calls[0]![1];
    const player = bus.export.mock.calls[1]![1];
    expect(root.Identity).toBe("Groovenet");
    expect(root.CanQuit).toBe(false);
    root.Raise();
    root.Quit();
    expect(player.Position).toBe(12500000n);
    expect(player.Metadata).toEqual({
      "mpris:trackid": new dbus.Variant("o", trackPath(initial)),
      "mpris:length": new dbus.Variant("x", 120000000n),
      "xesam:title": new dbus.Variant("s", "Title"),
      "xesam:artist": new dbus.Variant("as", ["Artist"]),
      "xesam:album": new dbus.Variant("s", "Album"),
    });
    expect(player.Rate).toBe(1);
    expect(player.CanControl).toBe(true);
    expect(player.CanPause).toBe(true);
    expect(player.CanSeek).toBe(true);
    expect(player.CanGoNext).toBe(true);
    expect(player.CanGoPrevious).toBe(true);
    await player.Play();
    await player.Pause();
    await player.PlayPause();
    await player.Next();
    await player.Previous();
    await player.Stop();
    await player.Seek(2000000n);
    await player.SetPosition(trackPath(initial), 3000000n);
    for (const method of ["pause", "next", "prev", "stop"])
      expect(client.request).toHaveBeenCalledWith(method, undefined);
    expect(client.request).toHaveBeenCalledWith("seek", { seconds: 14.5 });
    expect(client.request).toHaveBeenCalledWith("seek", { seconds: 3 });
    expect(() => player.OpenUri()).toThrow("Enqueue tracks");
    event({ ...initial, duration: null });
    expect(player.Metadata["mpris:length"]).toBeUndefined();
    event({ ...initial, current: null, queue: [], status: "ended" });
    expect(player.Metadata).toEqual({});
    expect(player.Position).toBe(0n);
    expect(player.CanPlay).toBe(false);
    expect(player.CanSeek).toBe(false);
    await close!();
    await close!();
    expect(client.listenerCount("event")).toBe(0);
    expect(client.listenerCount("disconnect")).toBe(0);
    expect(bus.disconnect).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("signals only changed properties and uses daemon state as authority", async () => {
    const { bus, client, options, event } = setup();
    vi.mocked(client.request).mockImplementationOnce(async () => {
      event(initial);
      return initial;
    });
    const close = await startMpris("unused", options);
    const player = bus.export.mock.calls[1]![1];
    const changes = vi.fn();
    player.$emitter.on("properties-changed", changes);
    event(initial, "track-change");
    event({ ...initial, position: 15 });
    expect(changes).not.toHaveBeenCalled();
    expect(player.Position).toBe(15000000n);
    event({ ...initial, status: "paused" });
    expect(changes).toHaveBeenLastCalledWith(
      { PlaybackStatus: new dbus.Variant("s", "Paused") },
      [],
    );
    await player.Play();
    expect(client.request).toHaveBeenLastCalledWith("play", undefined);
    vi.mocked(client.request).mockRejectedValueOnce(new Error("seek failed"));
    await expect(player.Seek(1000000n)).rejects.toThrow("seek failed");
    await close!();
  });

  it("cleans up on a duplicate bridge, connection failure, or daemon disconnect", async () => {
    const duplicate = setup(dbus.RequestNameReply.EXISTS);
    await expect(startMpris("unused", duplicate.options)).rejects.toThrow("already owns");
    expect(duplicate.bus.disconnect).toHaveBeenCalledOnce();
    const failed = setup();
    vi.mocked(failed.client.request).mockRejectedValueOnce(new Error("daemon unavailable"));
    await expect(startMpris("unused", failed.options)).rejects.toThrow("daemon unavailable");
    expect(failed.bus.disconnect).toHaveBeenCalledOnce();
    const disconnected = setup();
    await startMpris("unused", disconnected.options);
    disconnected.client.emit("disconnect");
    expect(disconnected.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("disconnected") }),
    );
    expect(disconnected.bus.disconnect).toHaveBeenCalledOnce();
  });

  it("handles loss of the session bus without touching daemon playback", async () => {
    const { bus, options, onError, client } = setup();
    await startMpris("unused", options);
    bus.emit("error", new Error("bus gone"));
    expect(onError).toHaveBeenCalled();
    expect(bus.disconnect).toHaveBeenCalledOnce();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("cleans up if publishing an event finds a closed bus stream", async () => {
    const { bus, options, event, onError } = setup();
    await startMpris("unused", options);
    const player = bus.export.mock.calls[1]![1];
    player.$emitter.on("properties-changed", () => {
      throw new Error("stream closed");
    });
    event({ ...initial, status: "paused" });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "stream closed" }));
    expect(bus.disconnect).toHaveBeenCalledOnce();
  });

  it("cleans up if the bus fails while the initial status is pending", async () => {
    const { bus, options, client } = setup();
    vi.mocked(client.request).mockImplementationOnce(async () => {
      bus.emit("error", new Error("lost bus"));
      return initial;
    });
    await expect(startMpris("unused", options)).rejects.toThrow("disconnected during startup");
    expect(bus.disconnect).toHaveBeenCalledOnce();
  });

  it("uses the default loader and client, and cleans up an unavailable socket", async () => {
    const { bus } = setup();
    const sessionBus = vi
      .spyOn(dbus, "sessionBus")
      .mockReturnValue(bus as unknown as ReturnType<typeof dbus.sessionBus>);
    try {
      await expect(
        startMpris("/nonexistent/groovenet-mpris.sock", {
          platform: "linux",
          env: { DBUS_SESSION_BUS_ADDRESS: "fake" },
        }),
      ).rejects.toThrow("unavailable");
      expect(bus.disconnect).toHaveBeenCalledOnce();
    } finally {
      sessionBus.mockRestore();
    }
  });

  it("uses the process platform and environment defaults safely", async () => {
    if (process.platform !== "linux") expect(await startMpris("unused")).toBeNull();
    vi.stubEnv("DBUS_SESSION_BUS_ADDRESS", "");
    try {
      expect(await startMpris("unused", { platform: "linux" })).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a bus failure during name acquisition even if the bus call hangs", async () => {
    const { bus, options } = setup();
    bus.requestName.mockImplementationOnce(() => {
      queueMicrotask(() => bus.emit("error", new Error("name failed")));
      return new Promise(() => {});
    });
    await expect(startMpris("unused", { ...options, onError: undefined })).rejects.toThrow(
      "name failed",
    );
    expect(bus.disconnect).toHaveBeenCalledOnce();
  });
});
