import React, { useEffect, useMemo, useState } from "react";
import { Box, render, Text, useApp, useInput, type RenderOptions } from "ink";
import type { ReactElement } from "react";
import { GroovenetClient, loadConfig, type Playlist, type Track } from "@groovenet/client";
import { PlayerControlClient, PlayerDaemon, PlayerProtocolError, type AudioDevice, type PlaybackSnapshot, type QueueEntry } from "@groovenet/player";
import { createPlayerDaemon, PLAYER_DAEMON_PATHS } from "./player.js";
import { RemotePlayerController, makeRemoteApi, type PlayerController, type RemoteSnapshot } from "./remotePlayer.js";
import { playerTuiAction } from "./playerTuiKeys.js";
import { formatPlayback, visibleWindow } from "./playerTuiView.js";

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

const LIST_ROWS = 12;

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
  render?: (node: ReactElement, options: RenderOptions) => { waitUntilExit(): Promise<unknown> };
}

export async function runPlayerTui(options: PlayerTuiOptions = {}, runtime: PlayerTuiRuntime = {}): Promise<void> {
  if (options.remote) {
    if (options.backend || options.artwork || options.logPlays) throw new Error("Remote players use server engine settings; omit local backend/artwork/log-plays flags.");
    const control = runtime.createRemote?.(options.remote) ?? new RemotePlayerController(makeRemoteApi(), options.remote, { allow_unknown: options.allowUnknown, takeover: options.takeover });
    try {
      const initialSnapshot = await control.refresh();
      const app = (runtime.render ?? render)(<PlayerTui control={control} api={runtime.createApi?.() ?? makeApiClient()} initialSnapshot={initialSnapshot} options={options} />, { alternateScreen: true, exitOnCtrlC: true });
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
    const app = renderTui(<PlayerTui control={control} api={api} initialSnapshot={initialSnapshot} options={options} />, {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
    await app.waitUntilExit();
  } finally {
    await control.close();
    if (daemon) await daemon.stop();
  }
}

export function PlayerTui({ control, api, initialSnapshot, options }: {
  control: PlayerController;
  api: GroovenetClient;
  initialSnapshot: PlaybackSnapshot;
  options: PlayerTuiOptions;
}) {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [view, setView] = useState<View>(options.search ? "search" : "queue");
  const [query, setQuery] = useState(options.search ?? "");
  const [editingSearch, setEditingSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(true);

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
    const action = playerTuiAction(input, key, editingSearch);
    if (options.remote && view === "devices" && ["U", "T", "t", "Y", "!"].includes(input)) {
      const device = items[selected] as AudioDevice | undefined;
      const policy = input === "U" || input === "Y" ? { allow_unknown: true } : input === "T" || input === "!" ? { takeover: true } : {};
      if (["t", "Y", "!"].includes(input)) {
        if (device) void runControl("devices.transfer", { id: device.id, ...policy });
      } else void runControl("play", policy);
      return;
    }
    if (options.remote && !editingSearch) {
      if (input === "s") { void runControl("stop"); return; }
      if (view === "queue" && (input === "[" || input === "]")) {
        const entry = snapshot.queue[selected];
        if (entry) void runControl("queue.move", { id: entry.id, to: Math.max(0, Math.min(snapshot.queue.length - 1, selected + (input === "[" ? -1 : 1))) });
        return;
      }
    }
    if (!action) return;
    switch (action.type) {
      case "quit": exit(); break;
      case "help": setShowHelp((value) => !value); break;
      case "play": void runControl("play"); break;
      case "pause": void runControl(snapshot.status === "paused" ? "resume" : "pause"); break;
      case "next": void runControl("next"); break;
      case "previous": void runControl("prev"); break;
      case "search": setEditingSearch(true); setView("search"); setMessage("Type a query, then press Enter."); break;
      case "playlists": void loadPlaylists(); break;
      case "queue": setView("queue"); setSelected(0); break;
      case "devices": void loadDevices(); break;
      case "seek-forward": void runControl("seek", { seconds: snapshot.position + 10 }); break;
      case "seek-backward": void runControl("seek", { seconds: Math.max(0, snapshot.position - 10) }); break;
      case "volume-up": void runControl("volume", { volume: Math.min(100, snapshot.volume + 5) }); break;
      case "volume-down": void runControl("volume", { volume: Math.max(0, snapshot.volume - 5) }); break;
      case "select": void selectCurrent(); break;
      case "add": void addSelected(); break;
      case "remove": {
        const item = snapshot.queue[selected];
        if (item) void runControl("queue.remove", { id: item.id });
        break;
      }
      case "move": setSelected((index) => Math.max(0, Math.min(Math.max(0, items.length - 1), index + action.amount))); break;
      case "cancel-search": setEditingSearch(false); setMessage(""); break;
      case "search-submit": setEditingSearch(false); void search(query); break;
      case "search-text": setQuery((value) => action.text === "\b" ? value.slice(0, -1) : `${value}${action.text}`); break;
    }
  });

  const remote = (snapshot as Partial<RemoteSnapshot>).remote;
  const output = remote ? devices.find((device) => device.id === (remote.player.assigned_output ?? remote.player.state.desired_output)) : undefined;
  const playbackLines = formatPlayback(snapshot);
  const rows = visibleWindow(items.length, selected, LIST_ROWS);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">Groovenet Player · {remote ? `Remote: ${remote.player.name} [${remote.player.id}]` : "Local"}</Text>
      {remote ? <Text color="yellow">{remote.connected ? "Connected" : "DISCONNECTED / state may be stale"} · revision={remote.player.revision} · desired={remote.player.state.desired_output ?? "none"} · assigned={remote.player.assigned_output ?? "none"} · {remote.player.state.checkpoint ? "saved checkpoint" : "live state"} · requested sender volume</Text> : null}
      {remote ? <Text dimColor>{output?.name ?? "Speaker activity=unknown · observations unavailable"}</Text> : null}
      {options.remote ? <Text dimColor>Devices: U play desired output allowing unknown · T play desired output taking over occupied · t transfer+play · Y transfer allowing unknown · ! transfer taking over occupied · s stop · [/] reorder queue · server audio continues after q</Text> : null}
      <Text>{playbackLines[0]}</Text>
      <Text dimColor>{playbackLines[1] || " "}</Text>
      <Text color="green">{playbackLines[2]}</Text>
      {snapshot.error ? <Text color="red">{snapshot.error.code}: {snapshot.error.message}</Text> : null}
      <Text dimColor>View: {view} · {items.length} item(s){items.length > LIST_ROWS ? ` · ${selected + 1}/${items.length}` : ""}{editingSearch ? ` · Search: ${query}▏` : query ? ` · Query: ${query}` : ""}</Text>
      <Box flexDirection="column" marginTop={1}>
        {items.length === 0 ? <Text dimColor>{view === "queue" ? "Queue is empty." : "No items."}</Text> : items.slice(rows.start, rows.end).map((item, row) => {
          const index = rows.start + row;
          const selectedItem = index === selected;
          const label = view === "search"
            ? `${(item as Track).artist} — ${(item as Track).title}${(item as Track).local_audio_url ? "" : " [no downloaded audio]"}`
            : view === "playlists" ? (item as Playlist).name
              : view === "devices" ? `${(item as AudioDevice).name} [${(item as AudioDevice).id}]`
                : `${(item as QueueEntry).track.artist} — ${(item as QueueEntry).track.title}`;
          return <Text key={view === "queue" ? (item as QueueEntry).id : `${view}-${index}`} color={selectedItem ? "black" : undefined} backgroundColor={selectedItem ? "cyan" : undefined}>{selectedItem ? "› " : "  "}{label}</Text>;
        })}
      </Box>
      {message ? <Text color="yellow">{message}</Text> : null}
      {showHelp ? <Text dimColor>↑/↓ or j/k select · Enter add/play · r play · a add · x remove · Space pause · n/p skip · ←/→ seek · +/- volume · / search · l playlists · u queue · d devices · ? help · q quit</Text> : <Text dimColor>Press ? for help · q quit</Text>}
    </Box>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
