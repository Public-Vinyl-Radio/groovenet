import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { render, useApp, useInput, type RenderOptions } from "ink";
import type { ReactElement } from "react";
import { GroovenetClient, loadConfig, formatSeconds } from "@groovenet/client";
import {
  PlayerControlClient,
  PlayerDaemon,
  PlayerProtocolError,
  type AudioDevice,
  type PlaybackSnapshot,
  type QueueEntry,
} from "@groovenet/player";
import { createPlayerDaemon, PLAYER_DAEMON_PATHS } from "./player.js";
import {
  RemotePlayerController,
  makeRemoteApi,
  type PlayerController,
  type RemoteSnapshot,
} from "./remotePlayer.js";
import {
  buildKeymap,
  defaultKeymap,
  displayKeys,
  helpEntries,
  hintItems,
  hintLine,
  primaryKey,
  type Keymap,
} from "./playerKeymap.js";
import type { ServerPlayer } from "@groovenet/contracts";
import { PlayerTargets, upcomingLocal, type TargetConnection } from "./playerTuiTargets.js";
import { PlayOnView, DevicesView, targetHints } from "./playerTuiOutputs.js";
import type { ActionId } from "./playerKeymapRegistry.js";
import { playerTuiAction } from "./playerTuiKeys.js";
import { currentIndex, NowPlaying, QueueView, stripHints } from "./playerTuiQueue.js";
import { PlaylistsView, playlistHints } from "./playerTuiPlaylists.js";
import { queuePlaylist, usePlayerPlaylists } from "./playerTuiPlaylistsState.js";
import { SearchView, searchHints } from "./playerTuiSearch.js";
import { queueSearchTracks, usePlayerSearch, modeLabel } from "./playerTuiSearchState.js";
import { openFullView } from "./playerTuiFullView.js";
import { useQueueMetadata } from "./playerTuiMetadata.js";
import { ArtworkProvider } from "../tui/artworkSlot.js";
import { artworkSource } from "../tui/artwork.js";
import { PlayerFrame, type TabItem } from "../tui/frame.js";
import { pickLayout } from "../tui/layout.js";
import { Styled, type Segment } from "../tui/primitives.js";
import { wrap } from "../tui/text.js";
import { ThemeContext, themeFromEnv, type Role, type Theme } from "../tui/theme.js";
import { useTerminalSize } from "../tui/useTerminalSize.js";

export interface PlayerTuiOptions {
  remote?: string;
  allowUnknown?: boolean;
  takeover?: boolean;
  backend?: string;
  search?: string;
  playlist?: string;
  /** Overrides `player_artwork` for the daemon this TUI starts. */
  artwork?: boolean;
  /** Overrides `player_log_plays` for the daemon this TUI starts. */
  logPlays?: boolean;
}

type View = "search" | "playlists" | "queue" | "devices";

function makeApiClient(): GroovenetClient {
  const config = loadConfig();
  return new GroovenetClient({
    baseUrl: config.api_base,
    apiKey: config.api_key,
    playerApiKey: process.env.PLAYER_API_KEY || config.player_api_key,
    insecureTls: config.insecure_tls,
    clientName: "cli",
  });
}

export interface PlayerTuiRuntime {
  createRemote?: (id: string) => RemotePlayerController;
  createControl?: () => PlayerControlClient;
  createDaemon?: () => PlayerDaemon;
  createApi?: () => GroovenetClient;
  /** The active keymap; defaults to the `player_keymap` in the config. */
  keymap?: Keymap;
  render?: (node: ReactElement, options: RenderOptions) => { waitUntilExit(): Promise<unknown> };
}

export async function runPlayerTui(
  options: PlayerTuiOptions = {},
  runtime: PlayerTuiRuntime = {},
): Promise<void> {
  const config = loadConfig();
  const keymap = runtime.keymap ?? buildKeymap(config.player_keymap);
  if (options.remote && (options.backend || options.artwork || options.logPlays))
    throw new Error(
      "Remote players use server engine settings; omit local backend/artwork/log-plays flags.",
    );
  let daemon: PlayerDaemon | null = null;
  let localConnection: TargetConnection | undefined;
  let localControl: PlayerController | undefined;
  let targets: PlayerTargets | undefined;
  let initialControl: PlayerController | undefined;
  let localPending: Promise<TargetConnection> | undefined;
  const connectLocal = async (): Promise<TargetConnection> => {
    if (localConnection)
      return {
        ...localConnection,
        snapshot: await localConnection.control.request<PlaybackSnapshot>("status"),
      };
    let control =
      runtime.createControl?.() ?? new PlayerControlClient(PLAYER_DAEMON_PATHS.socketPath);
    localControl = control;
    let snapshot: PlaybackSnapshot;
    try {
      snapshot = await control.request<PlaybackSnapshot>("status");
    } catch (error) {
      if (!(error instanceof PlayerProtocolError) || error.code !== "DAEMON_UNAVAILABLE")
        throw error;
      daemon =
        runtime.createDaemon?.() ??
        createPlayerDaemon({
          backend: options.backend,
          artwork: options.artwork,
          logPlays: options.logPlays,
        });
      await daemon.start();
      await control.close();
      control =
        runtime.createControl?.() ?? new PlayerControlClient(PLAYER_DAEMON_PATHS.socketPath);
      localControl = control;
      snapshot = await control.request<PlaybackSnapshot>("status");
    }
    return (localConnection = { control, snapshot, id: "" });
  };
  const local = () => (localPending = connectLocal());
  const remote = (id: string) =>
    runtime.createRemote?.(id) ??
    new RemotePlayerController(makeRemoteApi(), id, {
      allow_unknown: options.allowUnknown,
      takeover: options.takeover,
    });
  try {
    let connection: TargetConnection;
    if (options.remote) {
      const control = remote(options.remote);
      initialControl = control;
      connection = { control, snapshot: await control.refresh(), id: options.remote };
    } else {
      connection = await local();
      initialControl = connection.control;
    }
    const api = runtime.createApi?.() ?? makeApiClient();
    targets = new PlayerTargets(connection, api, local, remote, true);
    const app = (runtime.render ?? render)(
      <PlayerTui
        control={connection.control}
        api={api}
        initialSnapshot={connection.snapshot}
        options={options}
        keymap={keymap}
        searchFriendId={config.default_friend_id}
        targets={targets}
      />,
      { alternateScreen: true, exitOnCtrlC: true },
    );
    if (options.remote) (connection.control as RemotePlayerController).startEvents();
    await app.waitUntilExit();
  } finally {
    await targets?.close();
    await localPending?.catch(() => {});
    if (!targets || !options.remote) await initialControl?.close();
    if (localControl && localControl !== initialControl) await localControl.close();
    if (daemon) await (daemon as PlayerDaemon).stop();
  }
}

export function PlayerTui({
  control: initialControl,
  api,
  initialSnapshot,
  options,
  targets: providedTargets,
  keymap = defaultKeymap,
  theme: themeOverride,
  searchFriendId,
  fullView = openFullView,
}: {
  control: PlayerController;
  targets?: PlayerTargets;
  api: GroovenetClient;
  initialSnapshot: PlaybackSnapshot;
  options: PlayerTuiOptions;
  keymap?: Keymap;
  /** Collection scope from default_friend_id, shared by local and remote search. */
  searchFriendId?: number;
  /** Colour roles; defaults to the terminal's, honouring NO_COLOR. */
  theme?: Theme;
  /** `↵` in the strip: zooms the tmux pane; resolves to a message to show, or "". */
  fullView?: () => Promise<string>;
}) {
  const [targets] = useState(
    () =>
      providedTargets ??
      new PlayerTargets(
        { control: initialControl, snapshot: initialSnapshot, id: options.remote ?? "" },
        api,
        async () => {
          if (options.remote) throw new Error("Local target is unavailable in this embedded TUI.");
          return {
            control: initialControl,
            snapshot: await initialControl.request<PlaybackSnapshot>("status"),
            id: "",
          };
        },
        (id) =>
          new RemotePlayerController(makeRemoteApi(), id, {
            allow_unknown: options.allowUnknown,
            takeover: options.takeover,
          }),
      ),
  );
  useSyncExternalStore(targets.subscribe, targets.getSnapshot, targets.getSnapshot);
  const control = targets.active.control;
  const remoteMode = !!targets.active.id;
  const [picker, setPicker] = useState(false);
  const commands = useRef(0);
  const [chosen, setChosen] = useState(targets.active.id);
  const [players, setPlayers] = useState<ServerPlayer[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryProblem, setDiscoveryProblem] = useState("");
  const [, setSessionVersion] = useState(0);
  const acknowledgement = picker
    ? targets.confirmation
    : control instanceof RemotePlayerController
      ? control.session.getSnapshot().acknowledgement
      : null;
  const keyContext = acknowledgement ? "confirmation" : picker ? "play-on" : undefined;
  const { exit } = useApp();
  const size = useTerminalSize();
  const layout = pickLayout(size.columns, size.rows);
  const theme = useMemo(() => themeOverride ?? themeFromEnv(), [themeOverride]);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const displaySnapshot = useQueueMetadata(api, snapshot, remoteMode);
  const [view, setView] = useState<View>(options.search ? "search" : "queue");
  const search = usePlayerSearch(
    api,
    view === "search",
    options.search ?? "",
    async (tracks, play) => {
      await queueSearchTracks(control, tracks, play, remoteMode);
      const result = await control.request<PlaybackSnapshot>("status");
      if (targets.active.control === control) setSnapshot(result);
    },
    searchFriendId,
  );
  const editingSearch = view === "search" && search.editing;
  const playlists = usePlayerPlaylists(
    api,
    view === "playlists",
    async (playlist, tracks, play) => {
      await queuePlaylist(control, playlist, tracks, play, remoteMode);
      const result = await control.request<PlaybackSnapshot>("status");
      if (targets.active.control === control) setSnapshot(result);
    },
  );
  const editingInput =
    !picker && !acknowledgement && (editingSearch || (view === "playlists" && playlists.editing));
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  // The queue opens on the playing entry.
  const [selected, setSelected] = useState(() => Math.max(0, currentIndex(initialSnapshot)));
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  // Keymap problems are shown once and dismissed by the next key: stderr would corrupt the screen.
  const [notice, setNotice] = useState<string[] | null>(
    keymap.problems.length ? keymap.problems.map((problem) => problem.message) : null,
  );

  const items = useMemo((): Array<QueueEntry | AudioDevice> => {
    if (view === "search" || view === "playlists") return [];
    if (view === "devices") return devices;
    return snapshot.queue;
  }, [devices, snapshot.queue, view]);

  useEffect(() => {
    let active = true;
    setSnapshot(targets.active.snapshot);
    setDevices([]);
    const onEvent = (event: { event: string; data: unknown }) => {
      if (!active || targets.active.control !== control) return;
      if (event.event === "state") setSnapshot(event.data as PlaybackSnapshot);
      if (event.event === "error")
        setMessage(
          (event.data as { error?: { message?: string } }).error?.message ??
            "A track could not be played.",
        );
    };
    const onSession = () => {
      if (active) setSessionVersion((v) => v + 1);
    };
    control.on("event", onEvent);
    control.on("session", onSession);
    void control
      .request<PlaybackSnapshot>("status")
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((error) => {
        if (active) setMessage(errorMessage(error));
      });
    return () => {
      active = false;
      control.off("event", onEvent);
      control.off("session", onSession);
    };
  }, [control]);
  useEffect(() => {
    if (options.playlist) void addPlaylist(options.playlist);
  }, []);
  useEffect(
    () => () => {
      if (!providedTargets) void targets.close();
    },
    [targets, providedTargets],
  );
  useEffect(() => {
    if (!picker) return;
    let active = true;
    let sequence = 0;
    const discover = async () => {
      const request = ++sequence;
      setDiscovering(true);
      setDiscoveryProblem("");
      try {
        const result = await targets.api.listServerPlayers();
        if (active && sequence === request) {
          setPlayers(result);
          setDiscoveryProblem("");
        }
      } catch (error) {
        if (active && sequence === request) {
          setPlayers([]);
          setDiscoveryProblem(errorMessage(error));
        }
      } finally {
        if (active && sequence === request) setDiscovering(false);
      }
    };
    void discover();
    const timer = setInterval(() => {
      void discover();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [picker, control]);
  useEffect(() => {
    if (picker) void targets.previewTarget(chosen);
  }, [picker, chosen, targets]);
  useEffect(() => {
    if (
      picker &&
      chosen &&
      chosen !== targets.active.id &&
      !discovering &&
      !targets.busy &&
      !players.some((player) => player.id === chosen)
    )
      void targets.cancel();
  }, [picker, chosen, players, discovering, targets, targets.busy]);

  // Keep the cursor on a row when the list shrinks under it (a removal, a remote edit).
  useEffect(() => {
    if (selected > 0 && selected >= items.length) setSelected(Math.max(0, items.length - 1));
  }, [items.length, selected]);

  useEffect(() => {
    if (!remoteMode && view !== "devices") return;
    let cancelled = false;
    const refreshDevices = async () => {
      try {
        const result = await control.request<AudioDevice[]>("devices");
        if (!cancelled && Array.isArray(result)) setDevices(result);
      } catch (error) {
        if (!cancelled) {
          setDevices([]);
          setMessage(`Speaker observations unavailable: ${errorMessage(error)}`);
        }
      }
    };
    void refreshDevices();
    const timer = setInterval(() => {
      void refreshDevices();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Opening devices fetches explicitly; this effect follows target ownership changes.
  }, [control, remoteMode]);

  async function runControl(method: string, params?: Record<string, unknown>): Promise<unknown> {
    commands.current++;
    try {
      const result = await control.request(method, params);
      if (targets.active.control !== control) return undefined;
      if (result && typeof result === "object" && "status" in result)
        setSnapshot(result as PlaybackSnapshot);
      setMessage("");
      return result;
    } catch (error) {
      if (targets.active.control === control) setMessage(errorMessage(error));
      return undefined;
    } finally {
      commands.current--;
    }
  }

  async function addPlaylist(id: string): Promise<void> {
    await runControl("queue.add", { playlistId: id });
    setView("queue");
  }

  async function loadDevices(): Promise<void> {
    const result = await runControl("devices");
    if (Array.isArray(result)) {
      setDevices(result as AudioDevice[]);
      setView("devices");
      setSelected(0);
    }
  }

  async function selectCurrent(): Promise<void> {
    if (view === "devices") {
      const item = items[selected] as AudioDevice | undefined;
      if (item) await runControl("devices.select", { id: item.id });
      return;
    }
    await runControl(
      "play",
      remoteMode ? { id: snapshot.queue[selected]?.id } : { index: selected },
    );
  }

  useInput((input, key) => {
    setNotice(null);
    const action = playerTuiAction(input, key, {
      view: keyContext ?? view,
      editingSearch: editingInput,
      remote: remoteMode,
      keymap,
    });
    if (!action) return;
    if ("text" in action) {
      if (view === "playlists") playlists.updateQuery((value) => value + action.text);
      else search.setQuery((value) => `${value}${action.text}`);
      return;
    }
    if (
      !picker &&
      !acknowledgement &&
      view === "search" &&
      !(action.id === "list.select" && layout.kind === "strip") &&
      search.handle(action.id)
    ) {
      setMessage("");
      return;
    }
    if (
      !picker &&
      !acknowledgement &&
      view === "playlists" &&
      !(action.id === "list.select" && layout.kind === "strip") &&
      playlists.handle(action.id)
    ) {
      setMessage("");
      return;
    }
    if (keyContext) {
      if (action.id === "app.quit") exit();
      if (action.id === "app.help") setShowHelp((value) => !value);
      if (action.id === "list.select" && layout.kind === "strip") {
        void fullView().then(setMessage);
        return;
      }
      if (action.id === "target.cancel") {
        if (picker)
          void targets.cancel().then((done) => {
            if (done) setPicker(false);
          });
        else if (control instanceof RemotePlayerController) {
          control.session.dismissAcknowledgement();
          setMessage("");
        }
      }
      if (action.id === "target.confirm") {
        if (picker)
          void targets.acknowledge().then((done) => {
            if (done) {
              setPicker(false);
              setMessage(targets.problem);
            }
          });
        else if (control instanceof RemotePlayerController)
          void control.session.acknowledge().then(() => {
            if (targets.active.control === control)
              setMessage(control.session.getSnapshot().problem ?? "");
          });
      }
      if (picker && !acknowledgement && !targets.busy) {
        const ids = ["", ...players.map((player) => player.id)];
        const index = Math.max(0, ids.indexOf(chosen));
        if (action.id === "list.up" || action.id === "list.down")
          setChosen(
            ids[Math.max(0, Math.min(ids.length - 1, index + (action.id === "list.up" ? -1 : 1)))]!,
          );
        if (action.id === "list.select") {
          if (
            chosen &&
            chosen !== targets.active.id &&
            !players.some((player) => player.id === chosen)
          ) {
            setMessage("Target vanished. Choose a current server.");
            return;
          }
          void targets.select(chosen).then((done) => {
            if (done) {
              setPicker(false);
              setMessage(targets.problem);
            }
          });
        }
      }
      return;
    }
    const device = items[selected] as AudioDevice | undefined;
    switch (action.id) {
      case "app.quit":
        exit();
        break;
      case "app.help":
        setShowHelp((value) => !value);
        break;
      case "transport.play":
        void runControl("play");
        break;
      case "transport.toggle":
        void runControl(snapshot.status === "paused" ? "resume" : "pause");
        break;
      case "transport.next":
        void runControl("next");
        break;
      case "transport.prev":
        void runControl("prev");
        break;
      case "transport.stop":
        void runControl("stop");
        break;
      case "view.search":
        search.handle("view.search");
        setView("search");
        setMessage("");
        break;
      case "view.playlists":
        setView("playlists");
        setMessage("");
        break;
      case "view.queue":
        setView("queue");
        setSelected(Math.max(0, currentIndex(snapshot)));
        break;
      case "view.devices":
        void loadDevices();
        break;
      case "play-on.open":
        if (search.busy || playlists.busy || commands.current) {
          setMessage("Wait for the queue update before switching targets.");
          break;
        }
        setChosen(targets.active.id);
        setPicker(true);
        setMessage("");
        break;
      case "transport.seek-forward":
        void runControl("seek", { seconds: snapshot.position + 10 });
        break;
      case "transport.seek-back":
        void runControl("seek", { seconds: Math.max(0, snapshot.position - 10) });
        break;
      case "transport.volume-up":
        void runControl("volume", { volume: Math.min(100, snapshot.volume + 5) });
        break;
      case "transport.volume-down":
        void runControl("volume", { volume: Math.max(0, snapshot.volume - 5) });
        break;
      case "list.select":
        if (layout.kind === "strip") void fullView().then(setMessage);
        else void selectCurrent();
        break;
      case "queue.remove": {
        const item = snapshot.queue[selected];
        if (item) void runControl("queue.remove", { id: item.id });
        break;
      }
      case "queue.move-up":
      case "queue.move-down": {
        const entry = snapshot.queue[selected];
        const to = selected + (action.id === "queue.move-up" ? -1 : 1);
        // The cursor follows the entry it moved.
        if (entry && to >= 0 && to < snapshot.queue.length) {
          setSelected(to);
          void runControl("queue.move", { id: entry.id, to });
        }
        break;
      }
      case "devices.play-allow-unknown":
        void runControl("play", { allow_unknown: true });
        break;
      case "devices.play-takeover":
        void runControl("play", { takeover: true });
        break;
      case "devices.transfer":
        if (device) void runControl("devices.transfer", { id: device.id });
        break;
      case "devices.transfer-allow-unknown":
        if (device) void runControl("devices.transfer", { id: device.id, allow_unknown: true });
        break;
      case "devices.transfer-takeover":
        if (device) void runControl("devices.transfer", { id: device.id, takeover: true });
        break;
      case "list.up":
        setSelected((index) => Math.max(0, Math.min(Math.max(0, items.length - 1), index - 1)));
        break;
      case "list.down":
        setSelected((index) => Math.max(0, Math.min(Math.max(0, items.length - 1), index + 1)));
        break;
      case "input.cancel":
      case "input.submit":
      case "input.backspace":
      case "queue.add":
      case "playlists.filter":
      case "nav.open":
      case "search.scope":
      case "search.mode":
      case "app.debug":
        break;
    }
  });

  const remote = (snapshot as Partial<RemoteSnapshot>).remote;
  const previewPlayer = chosen === targets.active.id ? remote?.player : targets.preview?.player;
  const pickerPlayers = players.map((player) =>
    previewPlayer?.id === player.id && previewPlayer.revision >= player.revision
      ? previewPlayer
      : player,
  );
  const output = remote
    ? devices.find(
        (device) =>
          device.id === (remote.player.assigned_output ?? remote.player.state.desired_output),
      )
    : undefined;
  const keyView = keyContext ?? (editingInput ? "input" : view);
  const quitKeys = displayKeys(keymap, "app.quit", "queue");

  // Lines the body shows above the list. Each is one screen row, so the list knows how many rows are left.
  const preamble: Array<{ text: string; role: Role }> = [
    ...(notice
      ? wrap(
          `Keymap: ${notice.slice(0, 4).join(" · ")}${notice.length > 4 ? ` · +${notice.length - 4} more` : ""} (run \`groovenet player keys\`; any key dismisses)`,
          layout.columns,
        ).map((text) => ({ text, role: "warn" as const }))
      : []),
    ...(remoteMode && !picker && !acknowledgement && view !== "search" && view !== "playlists"
      ? wrap(
          `Remote keys: ${hintLine(hintItems(keymap, null, { remote: true, remoteOnly: true }))} · server audio continues after ${quitKeys || "quitting"}`,
          layout.columns,
        ).map((text) => ({ text, role: "dim" as const }))
      : []),
  ];

  // The device list names a remote output `Name · activity=… · …`; the status line wants the name.
  const outputTarget = remote ? (output?.name.split(" · ")[0] ?? "NO OUTPUT") : "LOCAL";
  const target = remote
    ? `${remote.player.name.toUpperCase()} · ${output?.name.split(" · ")[0] ?? "NO OUTPUT"}`
    : "LOCAL";
  const connection = remote
    ? remote.connected
      ? "connected"
      : "DISCONNECTED · state may be stale"
    : "local daemon";
  const position =
    view === "search"
      ? search.count
        ? `${search.selected + 1}/${search.count}`
        : ""
      : view === "playlists"
        ? playlists.count
          ? `${playlists.selected + 1}/${playlists.count}`
          : ""
        : items.length
          ? `${Math.min(selected + 1, items.length)}/${items.length}`
          : "";
  // The full queue reads `N in queue · i/N`; elsewhere `i/N` sits on the right, where a narrow pane cannot cut it.
  const inlinePosition = view === "queue" && layout.kind === "full";
  const status: Segment[] = [
    { text: target, role: "muted" },
    {
      text: ` · ${connection}${remote?.player.state.checkpoint ? " · saved checkpoint" : ""} · ${snapshot.queue.length} in queue${inlinePosition && position ? ` · ${position}` : ""}`,
      role: "dim",
    },
  ];
  const searchStatus: Segment[] = [
    {
      text: `SEARCH · ${modeLabel(search.scope === "albums" ? "lexical" : search.mode).toLowerCase()} · ${search.opened ? "album tracks" : `${search.scope === "tracks" ? search.tracks.total : search.albums.total} ${search.scope}`}${search.tracks.degraded && search.scope === "tracks" ? " · semantic unavailable, keyword fallback" : ""}`,
      role: "dim",
    },
  ];
  const searchMessage =
    view === "search"
      ? search.busy
        ? "Adding to queue…"
        : search.message
      : view === "playlists"
        ? playlists.busy
          ? "Updating queue…"
          : playlists.message
        : "";
  const confirmMessage = acknowledgement
    ? `${acknowledgement.code === "AVAILABILITY_UNKNOWN" ? "Speaker status unknown" : "Speaker occupied"} · ${primaryKey(keymap, "target.confirm", "confirmation")} ${acknowledgement.code === "AVAILABILITY_UNKNOWN" ? "play anyway" : "take over"} · ${primaryKey(keymap, "target.cancel", "confirmation")} cancel`
    : "";
  const alert: Segment[] | null = confirmMessage
    ? [{ text: confirmMessage, role: "warn" }]
    : picker && targets.busy
      ? [{ text: "Joining…", role: "muted" }]
      : picker && targets.problem
        ? [{ text: targets.problem, role: "warn" }]
        : message
          ? [{ text: message, role: "warn" }]
          : snapshot.error
            ? [{ text: `${snapshot.error.code}: ${snapshot.error.message}`, role: "error" }]
            : searchMessage
              ? [{ text: searchMessage, role: "muted" }]
              : null;
  // Tabs show the view keys and the full top bar shows help and quit, so the hint bar leaves them out.
  const omit: ActionId[] =
    layout.kind === "full"
      ? [...TAB_ACTIONS, "app.help", "app.quit"]
      : layout.kind === "side"
        ? TAB_ACTIONS
        : [];
  const tab = (id: ActionId, label: string, tabView: View, count?: number): TabItem => ({
    keys: primaryKey(keymap, id, view),
    label,
    count,
    active: view === tabView,
  });

  return (
    <ArtworkProvider api={api}>
      <ThemeContext.Provider value={theme}>
        <PlayerFrame
          artwork={artworkSource(displaySnapshot.current?.track)}
          layout={layout}
          target={remote ? remote.player.name.toUpperCase() : "LOCAL"}
          live={remote ? (remote.connected ? "live" : "offline") : null}
          helpKeys={displayKeys(keymap, "app.help", "queue")}
          quitKeys={quitKeys}
          tabs={[
            tab("view.search", "SEARCH", "search"),
            tab("view.queue", "QUEUE", "queue", snapshot.queue.length),
            tab(
              "view.playlists",
              "PLAYLISTS",
              "playlists",
              playlists.playlists.length || undefined,
            ),
            tab("view.devices", "DEVICES", "devices"),
          ]}
          status={{
            left:
              view === "search"
                ? searchStatus
                : view === "playlists"
                  ? [
                      {
                        text: `PLAYLISTS · ${playlists.playlists.length}${playlists.opened ? " · tracks" : ""}`,
                        role: "dim",
                      },
                    ]
                  : status,
            right: !inlinePosition && position ? [{ text: position, role: "dim" }] : [],
          }}
          alert={alert}
          compactPlayback={
            view === "search" || view === "playlists"
              ? [
                  {
                    text: snapshot.current
                      ? `${snapshot.status === "playing" ? "▶" : "‖"} ${snapshot.current.track.title} · ${snapshot.current.track.artist}  ${formatSeconds(snapshot.position)}`
                      : "Nothing playing",
                    role: "muted",
                  },
                ]
              : undefined
          }
          hints={
            keyContext
              ? targetHints(keymap, keyContext, layout.kind === "strip", acknowledgement?.code)
              : view === "playlists" && layout.kind !== "strip"
                ? playlistHints(playlists, keymap)
                : view === "search" && layout.kind !== "strip"
                  ? searchHints(search, keymap)
                  : layout.kind === "strip" && keyView !== "input"
                    ? stripHints(keymap, keyView)
                    : hintItems(keymap, keyView, { remote: remoteMode, omit })
          }
          help={showHelp ? helpEntries(keymap, keyView, { remote: remoteMode }) : null}
          nowPlaying={(area) => (
            <NowPlaying
              snapshot={displaySnapshot}
              area={area}
              keymap={keymap}
              target={outputTarget}
            />
          )}
        >
          {(area) => (
            <>
              {!picker &&
                preamble.map((line, index) => (
                  <Styled key={`preamble-${index}`} role={line.role}>
                    {line.text}
                  </Styled>
                ))}
              {picker ? (
                <PlayOnView
                  players={pickerPlayers}
                  chosen={chosen}
                  current={targets.active.id}
                  preview={previewPlayer}
                  count={remoteMode ? 0 : upcomingLocal(snapshot).length}
                  loading={
                    discovering ||
                    (!!chosen && chosen !== targets.active.id && !targets.preview?.player)
                  }
                  problem={
                    targets.problem ||
                    targets.preview?.problem ||
                    discoveryProblem ||
                    (chosen && !players.some((player) => player.id === chosen) && !discovering
                      ? "Target is no longer available."
                      : "")
                  }
                  area={area}
                />
              ) : view === "search" ? (
                <SearchView
                  search={search}
                  keymap={keymap}
                  area={{ width: area.width, rows: Math.max(0, area.rows - preamble.length) }}
                />
              ) : view === "playlists" ? (
                <PlaylistsView
                  state={playlists}
                  keymap={keymap}
                  area={{ width: area.width, rows: Math.max(0, area.rows - preamble.length) }}
                />
              ) : view === "queue" && (layout.kind === "full" || layout.kind === "side") ? (
                <QueueView
                  snapshot={displaySnapshot}
                  selected={selected}
                  area={{ width: area.width, rows: Math.max(1, area.rows - preamble.length) }}
                  kind={layout.kind}
                />
              ) : (
                <DevicesView devices={devices} selected={selected} area={area} />
              )}
            </>
          )}
        </PlayerFrame>
      </ThemeContext.Provider>
    </ArtworkProvider>
  );
}

const TAB_ACTIONS: ActionId[] = ["view.search", "view.queue", "view.playlists", "view.devices"];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
