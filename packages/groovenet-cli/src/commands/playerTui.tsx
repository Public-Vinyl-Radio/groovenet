import React, { useEffect, useMemo, useState } from "react";
import { render, useApp, useInput, type RenderOptions } from "ink";
import type { ReactElement } from "react";
import { GroovenetClient, loadConfig, type Playlist, type Track } from "@groovenet/client";
import { PlayerControlClient, PlayerDaemon, PlayerProtocolError, type AudioDevice, type PlaybackSnapshot, type QueueEntry } from "@groovenet/player";
import { createPlayerDaemon, PLAYER_DAEMON_PATHS } from "./player.js";
import { RemotePlayerController, makeRemoteApi, type PlayerController, type RemoteSnapshot } from "./remotePlayer.js";
import { buildKeymap, defaultKeymap, displayKeys, helpEntries, hintItems, hintLine, primaryKey, type Keymap } from "./playerKeymap.js";
import type { ActionId } from "./playerKeymapRegistry.js";
import { playerTuiAction } from "./playerTuiKeys.js";
import { visibleWindow } from "./playerTuiView.js";
import { currentIndex, NowPlaying, QueueView, stripHints } from "./playerTuiQueue.js";
import { openFullView } from "./playerTuiFullView.js";
import { PlayerFrame, type TabItem } from "../tui/frame.js";
import { pickLayout } from "../tui/layout.js";
import { Styled, type Segment } from "../tui/primitives.js";
import { fit, wrap } from "../tui/text.js";
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
  return new GroovenetClient({ baseUrl: config.api_base, apiKey: config.api_key, insecureTls: config.insecure_tls, clientName: "cli" });
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

export async function runPlayerTui(options: PlayerTuiOptions = {}, runtime: PlayerTuiRuntime = {}): Promise<void> {
  const keymap = runtime.keymap ?? buildKeymap(loadConfig().player_keymap);
  if (options.remote) {
    if (options.backend || options.artwork || options.logPlays) throw new Error("Remote players use server engine settings; omit local backend/artwork/log-plays flags.");
    const control = runtime.createRemote?.(options.remote) ?? new RemotePlayerController(makeRemoteApi(), options.remote, { allow_unknown: options.allowUnknown, takeover: options.takeover });
    try {
      const initialSnapshot = await control.refresh();
      const app = (runtime.render ?? render)(<PlayerTui control={control} api={runtime.createApi?.() ?? makeApiClient()} initialSnapshot={initialSnapshot} options={options} keymap={keymap} />, { alternateScreen: true, exitOnCtrlC: true });
      control.startEvents();
      await app.waitUntilExit();
    } finally { await control.close(); }
    return;
  }
  let daemon: PlayerDaemon | null = null;
  let control = runtime.createControl?.() ?? new PlayerControlClient(PLAYER_DAEMON_PATHS.socketPath);
  try {
    let initialSnapshot: PlaybackSnapshot;
    try {
      initialSnapshot = await control.request<PlaybackSnapshot>("status");
    } catch (error) {
      if (!(error instanceof PlayerProtocolError) || error.code !== "DAEMON_UNAVAILABLE") throw error;
      daemon = runtime.createDaemon?.() ?? createPlayerDaemon({ backend: options.backend, artwork: options.artwork, logPlays: options.logPlays });
      await daemon.start();
      await control.close();
      control = runtime.createControl?.() ?? new PlayerControlClient(PLAYER_DAEMON_PATHS.socketPath);
      initialSnapshot = await control.request<PlaybackSnapshot>("status");
    }

    const api = runtime.createApi?.() ?? makeApiClient();
    const renderTui = runtime.render ?? render;
    const app = renderTui(<PlayerTui control={control} api={api} initialSnapshot={initialSnapshot} options={options} keymap={keymap} />, {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
    await app.waitUntilExit();
  } finally {
    await control.close();
    if (daemon) await daemon.stop();
  }
}

export function PlayerTui({ control, api, initialSnapshot, options, keymap = defaultKeymap, theme: themeOverride, fullView = openFullView }: {
  control: PlayerController;
  api: GroovenetClient;
  initialSnapshot: PlaybackSnapshot;
  options: PlayerTuiOptions;
  keymap?: Keymap;
  /** Colour roles; defaults to the terminal's, honouring NO_COLOR. */
  theme?: Theme;
  /** `↵` in the strip: zooms the tmux pane; resolves to a message to show, or "". */
  fullView?: () => Promise<string>;
}) {
  const { exit } = useApp();
  const size = useTerminalSize();
  const layout = pickLayout(size.columns, size.rows);
  const theme = useMemo(() => themeOverride ?? themeFromEnv(), [themeOverride]);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<View>(options.search ? "search" : "queue");
  const [query, setQuery] = useState(options.search ?? "");
  const [editingSearch, setEditingSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  // The queue opens on the playing entry.
  const [selected, setSelected] = useState(() => Math.max(0, currentIndex(initialSnapshot)));
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  // Keymap problems are shown once and dismissed by the next key: stderr would corrupt the screen.
  const [notice, setNotice] = useState<string[] | null>(keymap.problems.length ? keymap.problems.map((problem) => problem.message) : null);

  const items = useMemo((): Array<Track | Playlist | QueueEntry | AudioDevice> => {
    if (view === "search") return searchResults;
    if (view === "playlists") return playlists;
    if (view === "devices") return devices;
    return snapshot.queue;
  }, [devices, playlists, searchResults, snapshot.queue, view]);

  useEffect(() => {
    const onEvent = (event: { event: string; data: unknown }) => {
      if (event.event === "state") setSnapshot(event.data as PlaybackSnapshot);
      if (event.event === "error") {
        const data = event.data as { error?: { message?: string } };
        setMessage(data.error?.message ?? "A track could not be played.");
      }
    };
    control.on("event", onEvent);
    void control.request<PlaybackSnapshot>("status").then(setSnapshot).catch((error: unknown) => setMessage(errorMessage(error)));
    if (options.search) void search(options.search);
    if (options.playlist) void addPlaylist(options.playlist);
    return () => { control.off("event", onEvent); };
  // The startup actions should run once; the control client and API are stable for this view.
  }, []);

  // Keep the cursor on a row when the list shrinks under it (a removal, a remote edit).
  useEffect(() => {
    if (selected > 0 && selected >= items.length) setSelected(Math.max(0, items.length - 1));
  }, [items.length, selected]);

  useEffect(() => {
    if (!options.remote) return;
    let cancelled = false;
    const refreshDevices = async () => {
      try {
        const result = await control.request<AudioDevice[]>("devices");
        if (!cancelled && Array.isArray(result)) setDevices(result);
      } catch (error) {
        if (!cancelled) { setDevices([]); setMessage(`Speaker observations unavailable: ${errorMessage(error)}`); }
      }
    };
    void refreshDevices();
    const timer = setInterval(() => { void refreshDevices(); }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [control, options.remote]);

  async function runControl(method: string, params?: Record<string, unknown>): Promise<unknown> {
    try {
      const result = await control.request(method, params);
      if (result && typeof result === "object" && "status" in result) setSnapshot(result as PlaybackSnapshot);
      setMessage("");
      return result;
    } catch (error) {
      setMessage(errorMessage(error));
      return undefined;
    }
  }

  async function search(text: string): Promise<void> {
    setQuery(text);
    setView("search");
    setSelected(0);
    try {
      const result = await api.searchTracks({ query: text, limit: 30 });
      setSearchResults(result.tracks);
      setMessage(result.tracks.length ? "" : "No tracks found.");
    } catch (error) { setMessage(errorMessage(error)); }
  }

  async function loadPlaylists(): Promise<void> {
    setView("playlists");
    setSelected(0);
    try { setPlaylists(await api.listPlaylists()); setMessage(""); }
    catch (error) { setMessage(errorMessage(error)); }
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

  async function addSelected(): Promise<void> {
    const item = items[selected];
    if (!item) return;
    if (view === "search") {
      await runControl("queue.addTrack", { track: item });
      setView("queue");
    } else if (view === "playlists") {
      await addPlaylist(String((item as Playlist).id));
    }
  }

  async function selectCurrent(): Promise<void> {
    if (view === "search" || view === "playlists") { await addSelected(); return; }
    if (view === "devices") {
      const item = items[selected] as AudioDevice | undefined;
      if (item) await runControl("devices.select", { id: item.id });
      return;
    }
    await runControl("play", options.remote ? { id: snapshot.queue[selected]?.id } : { index: selected });
  }

  useInput((input, key) => {
    setNotice(null);
    const action = playerTuiAction(input, key, { view, editingSearch, remote: !!options.remote, keymap });
    if (!action) return;
    if ("text" in action) { setQuery((value) => `${value}${action.text}`); return; }
    const device = items[selected] as AudioDevice | undefined;
    switch (action.id) {
      case "app.quit": exit(); break;
      case "app.help": setShowHelp((value) => !value); break;
      case "transport.play": void runControl("play"); break;
      case "transport.toggle": void runControl(snapshot.status === "paused" ? "resume" : "pause"); break;
      case "transport.next": void runControl("next"); break;
      case "transport.prev": void runControl("prev"); break;
      case "transport.stop": void runControl("stop"); break;
      case "view.search": setEditingSearch(true); setView("search"); setMessage("Type a query, then press Enter."); break;
      case "view.playlists": void loadPlaylists(); break;
      case "view.queue": setView("queue"); setSelected(Math.max(0, currentIndex(snapshot))); break;
      case "view.devices": case "play-on.open": void loadDevices(); break;
      case "transport.seek-forward": void runControl("seek", { seconds: snapshot.position + 10 }); break;
      case "transport.seek-back": void runControl("seek", { seconds: Math.max(0, snapshot.position - 10) }); break;
      case "transport.volume-up": void runControl("volume", { volume: Math.min(100, snapshot.volume + 5) }); break;
      case "transport.volume-down": void runControl("volume", { volume: Math.max(0, snapshot.volume - 5) }); break;
      case "list.select":
        if (layout.kind === "strip") void fullView().then(setMessage);
        else void selectCurrent();
        break;
      case "queue.add": void addSelected(); break;
      case "queue.remove": {
        const item = snapshot.queue[selected];
        if (item) void runControl("queue.remove", { id: item.id });
        break;
      }
      case "queue.move-up": case "queue.move-down": {
        const entry = snapshot.queue[selected];
        const to = selected + (action.id === "queue.move-up" ? -1 : 1);
        // The cursor follows the entry it moved.
        if (entry && to >= 0 && to < snapshot.queue.length) { setSelected(to); void runControl("queue.move", { id: entry.id, to }); }
        break;
      }
      case "devices.play-allow-unknown": void runControl("play", { allow_unknown: true }); break;
      case "devices.play-takeover": void runControl("play", { takeover: true }); break;
      case "devices.transfer": if (device) void runControl("devices.transfer", { id: device.id }); break;
      case "devices.transfer-allow-unknown": if (device) void runControl("devices.transfer", { id: device.id, allow_unknown: true }); break;
      case "devices.transfer-takeover": if (device) void runControl("devices.transfer", { id: device.id, takeover: true }); break;
      case "list.up": setSelected((index) => Math.max(0, Math.min(Math.max(0, items.length - 1), index - 1))); break;
      case "list.down": setSelected((index) => Math.max(0, Math.min(Math.max(0, items.length - 1), index + 1))); break;
      case "input.cancel": setEditingSearch(false); setMessage(""); break;
      case "input.submit": setEditingSearch(false); void search(query); break;
      case "input.backspace": setQuery((value) => value.slice(0, -1)); break;
      // Registered for the views #823 adds; nothing to open, switch or show yet.
      case "nav.open": case "search.scope": case "search.mode": case "app.debug": break;
    }
  });

  const remote = (snapshot as Partial<RemoteSnapshot>).remote;
  const output = remote ? devices.find((device) => device.id === (remote.player.assigned_output ?? remote.player.state.desired_output)) : undefined;
  const remoteMode = !!options.remote;
  const keyView = editingSearch ? "input" : view;
  const quitKeys = displayKeys(keymap, "app.quit", "queue");

  // Lines the body shows above the list. Each is one screen row, so the list knows how many rows are left.
  const preamble: Array<{ text: string; role: Role }> = [
    ...(notice ? wrap(`Keymap: ${notice.slice(0, 4).join(" · ")}${notice.length > 4 ? ` · +${notice.length - 4} more` : ""} (run \`groovenet player keys\`; any key dismisses)`, layout.columns).map((text) => ({ text, role: "warn" as const })) : []),
    ...(remoteMode ? wrap(`Remote keys: ${hintLine(hintItems(keymap, null, { remote: true, remoteOnly: true }))} · server audio continues after ${quitKeys || "quitting"}`, layout.columns).map((text) => ({ text, role: "dim" as const })) : []),
    ...(view === "search" && (editingSearch || query) ? [{ text: editingSearch ? `Search: ${query}▏` : `Query: ${query}`, role: "muted" as const }] : []),
  ];
  const rows = visibleWindow(items.length, selected, Math.max(1, layout.bodyRows - preamble.length));

  // The device list names a remote output `Name · activity=… · …`; the status line wants the name.
  const target = remote ? (output?.name.split(" · ")[0] ?? "NO OUTPUT") : "LOCAL";
  const connection = remote ? (remote.connected ? "connected" : "DISCONNECTED · state may be stale") : "local daemon";
  const position = items.length ? `${Math.min(selected + 1, items.length)}/${items.length}` : "";
  // The full queue reads `N in queue · i/N`; elsewhere `i/N` sits on the right, where a narrow pane cannot cut it.
  const inlinePosition = view === "queue" && layout.kind === "full";
  const status: Segment[] = [
    { text: target, role: "muted" },
    { text: ` · ${connection}${remote?.player.state.checkpoint ? " · saved checkpoint" : ""} · ${snapshot.queue.length} in queue${inlinePosition && position ? ` · ${position}` : ""}`, role: "dim" },
  ];
  const alert: Segment[] | null = message ? [{ text: message, role: "warn" }]
    : snapshot.error ? [{ text: `${snapshot.error.code}: ${snapshot.error.message}`, role: "error" }] : null;
  // Tabs show the view keys and the full top bar shows help and quit, so the hint bar leaves them out.
  const omit: ActionId[] = layout.kind === "full" ? [...TAB_ACTIONS, "app.help", "app.quit"] : layout.kind === "side" ? TAB_ACTIONS : [];
  const tab = (id: ActionId, label: string, tabView: View, count?: number): TabItem => ({ keys: primaryKey(keymap, id, view), label, count, active: view === tabView });

  return (
    <ThemeContext.Provider value={theme}>
      <PlayerFrame
        layout={layout}
        target={remote ? remote.player.name.toUpperCase() : "LOCAL"}
        live={remote ? (remote.connected ? "live" : "offline") : null}
        helpKeys={displayKeys(keymap, "app.help", "queue")}
        quitKeys={quitKeys}
        tabs={[
          tab("view.search", "SEARCH", "search"),
          tab("view.queue", "QUEUE", "queue", snapshot.queue.length),
          tab("view.playlists", "PLAYLISTS", "playlists", playlists.length || undefined),
          tab("view.devices", "DEVICES", "devices"),
        ]}
        status={{ left: status, right: !inlinePosition && position ? [{ text: position, role: "dim" }] : [] }}
        alert={alert}
        hints={layout.kind === "strip" && keyView !== "input" ? stripHints(keymap, keyView) : hintItems(keymap, keyView, { remote: remoteMode, omit })}
        help={showHelp ? helpEntries(keymap, keyView, { remote: remoteMode }) : null}
        nowPlaying={(area) => <NowPlaying snapshot={snapshot} area={area} keymap={keymap} target={target} />}
      >
        {(area) => (
          <>
            {preamble.map((line, index) => <Styled key={`preamble-${index}`} role={line.role}>{line.text}</Styled>)}
            {view === "queue" && (layout.kind === "full" || layout.kind === "side")
              ? <QueueView snapshot={snapshot} selected={selected} area={{ width: area.width, rows: Math.max(1, area.rows - preamble.length) }} kind={layout.kind} />
              : items.length === 0 ? <Styled role="dim">No items.</Styled> : items.slice(rows.start, rows.end).map((item, row) => {
              const index = rows.start + row;
              const selectedItem = index === selected;
              const label = view === "search"
                ? `${(item as Track).artist} — ${(item as Track).title}${(item as Track).local_audio_url ? "" : " [no downloaded audio]"}`
                : view === "playlists" ? (item as Playlist).name
                  : `${(item as AudioDevice).name} [${(item as AudioDevice).id}]`;
              return <Styled key={`${view}-${index}`} role={selectedItem ? "selection" : "ink"}>{fit(`${selectedItem ? "› " : "  "}${label}`, area.width)}</Styled>;
            })}
          </>
        )}
      </PlayerFrame>
    </ThemeContext.Provider>
  );
}

const TAB_ACTIONS: ActionId[] = ["view.search", "view.queue", "view.playlists", "view.devices"];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
