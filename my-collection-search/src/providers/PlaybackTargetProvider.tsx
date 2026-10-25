"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { playerIdSchema, type ServerPlayer } from "@groovenet/contracts";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { ServerPlayerController, type RemoteView } from "@/providers/server-player/controller";
import { playerApi } from "@/services/internalApi/players";
import type { Track } from "@/types/track";
import type { ReplacePlaylistOptions } from "@/providers/playlist-player/useQueueState";

const storageKey = "mcs:playback-target";
const empty: RemoteView = { player: null, devices: [], connected: false, busy: false, problem: null, acknowledgement: null };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;

function useTargetState() {
  // An empty target means local; every valid named-player ID remains selectable.
  const [target, setTarget] = useState("");
  const [players, setPlayers] = useState<ServerPlayer[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const local = usePlaylistPlayer();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && playerIdSchema.safeParse(saved).success) setTarget(saved);
    } catch { /* Storage may be disabled; local playback remains available. */ }
    void playerApi.session().then(result => setAuthorized(result.authorized)).catch(() => {});
  }, []);
  const loadPlayers = useCallback(async () => {
    try { setPlayers(await playerApi.list()); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Server players unavailable"); }
  }, []);
  useEffect(() => { if (authorized) void loadPlayers(); }, [authorized, loadPlayers]);
  const controller = useMemo(() => target !== "" && authorized ? new ServerPlayerController(target) : null, [target, authorized]);
  useEffect(() => controller?.start(), [controller]);
  const remote = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const select = (next: string) => {
    if (next !== "" && !playerIdSchema.safeParse(next).success) return;
    // Pause only browser audio when explicitly leaving local mode. Remote
    // subscriptions can be replaced without any server transport command.
    if (target === "" && next !== "") local.pause();
    setTarget(next);
    try { localStorage.setItem(storageKey, next); } catch { /* optional preference */ }
  };
  const unlock = async (passphrase: string) => {
    try { await playerApi.unlock(passphrase); setAuthorized(true); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Unable to unlock players"); }
  };
  const lock = async () => {
    try { await playerApi.lock(); setAuthorized(false); setPlayers([]); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Unable to lock players"); }
  };
  return { target, select, players, authorized, unlock, lock, problem, reportProblem: setProblem, loadPlayers, controller, remote };
}
const Context = createContext<ReturnType<typeof useTargetState> | null>(null);
export function PlaybackTargetProvider({ children }: { children: ReactNode }) {
  const value = useTargetState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useOptionalPlaybackTarget = () => useContext(Context);
export function usePlaybackTarget() {
  const context = useContext(Context);
  if (!context) throw new Error("PlaybackTargetProvider is required");
  return context;
}

/** Shared controls used by collection enqueue actions and keyboard shortcuts. */
export function usePlaybackPlayer() {
  const local = usePlaylistPlayer();
  const target = useOptionalPlaybackTarget();
  if (!target || target.target === "") return local;
  const { controller, remote } = target;
  const reportLocked = () => target.reportProblem("Unlock server access before trying this action again.");
  const player = remote.player;
  const queue = player?.state.queue ?? [];
  const index = queue.findIndex(entry => entry.id === player?.state.current_entry_id);
  const add = async (items: Track[] | Track, at?: number) => {
    const tracks = (Array.isArray(items) ? items : [items]).map(({ track_id, friend_id }) => ({ track_id, friend_id }));
    if (!tracks.length) return null;
    if (!controller) { reportLocked(); return null; }
    return controller.command({ type: "queue.add", tracks, ...(at === undefined ? {} : { at }) });
  };
  const replace = async (tracks: Track[], options: ReplacePlaylistOptions = {}) => {
    if (!tracks.length) return;
    if (!controller) { reportLocked(); return; }
    // There is no atomic queue.replace command. Add first so a failed request
    // cannot destroy the existing queue. Existing entries are retained remotely.
    const existingIds = new Set(controller.getSnapshot().player?.state.queue.map(entry => entry.id));
    const result = await add(tracks);
    if (!result || options.autoplay !== true) return;
    const offset = options.startIndex ?? (options.startTrackId ? Math.max(0, tracks.findIndex(track => track.track_id === options.startTrackId)) : 0);
    const entry = result.state.queue.filter(entry => !existingIds.has(entry.id))[offset];
    if (entry) await controller.command({ type: "play", entry_id: entry.id });
  };
  const edit = (type: "play" | "resume" | "pause" | "stop" | "next" | "previous" | "queue.clear") => {
    if (controller) void controller.command({ type });
    else reportLocked();
  };
  return {
    playlist: queue, playlistLength: queue.length, currentTrackIndex: index < 0 ? null : index,
    isPlaying: player?.state.status === "playing", currentTrack: queue[index] ?? null,
    play: () => edit(player?.state.status === "paused" ? "resume" : "play"),
    pause: () => edit("pause"), stop: () => edit("stop"), playNext: () => edit("next"), playPrev: () => edit("previous"),
    clearQueue: () => edit("queue.clear"),
    replacePlaylist: (tracks: Track[], options?: ReplacePlaylistOptions) => { void replace(tracks, options); },
    appendToQueue: (items: Track[] | Track) => { void add(items); },
    enqueueNext: (items: Track[] | Track) => { void add(items, index + 1); },
  };
}
