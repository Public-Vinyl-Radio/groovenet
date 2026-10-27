"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { playerIdSchema, type ServerPlayer } from "@groovenet/contracts";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { ServerPlayerSession, upcomingTracks, type SessionView } from "@groovenet/client/player-session";
import { playerApi } from "@/services/internalApi/players";
import type { Track } from "@/types/track";
import type { ReplacePlaylistOptions } from "@/providers/playlist-player/useQueueState";

const storageKey = "mcs:playback-target";
const empty: SessionView = { player: null, devices: [], connected: false, busy: false, problem: null, acknowledgement: null };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;

type LocalQueue = Pick<ReturnType<typeof usePlaylistPlayer>, "playlist" | "currentTrackIndex" | "finishedTrack">;
/** What joining a server takes from this device: the current track onward, never what already played. */
export const upcomingLocalTracks = (queue: LocalQueue): Track[] => upcomingTracks(queue);

function useTargetState() {
  // An empty target means local; every valid named-player ID remains selectable.
  const [target, setTarget] = useState("");
  const [players, setPlayers] = useState<ServerPlayer[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const local = usePlaylistPlayer();
  const onJoined = local.clearQueue;
  const pendingJoin = useRef<{ id: string; tracks: Track[] } | null>(null);
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
  useEffect(() => {
    if (!authorized) return;
    let active = true;
    let generation = 0;
    let close: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      const current = ++generation;
      let worker: string | undefined;
      let sequence = -1;
      close = playerApi.subscribeAll(event => {
        if (!active || current !== generation) return;
        if (event.type === "players" && worker === undefined) {
          worker = event.worker_instance;
          sequence = event.sequence;
          setPlayers(event.players);
          setProblem(null);
        } else if (event.type === "snapshot" && event.worker_instance === worker && event.sequence > sequence) {
          sequence = event.sequence;
          setPlayers(players => {
            const existing = players.find(player => player.id === event.player.id);
            if (existing && existing.revision > event.player.revision) return players;
            return existing ? players.map(player => player.id === event.player.id ? event.player : player) : [...players, event.player];
          });
        }
      }, () => {
        if (!active || current !== generation) return;
        ++generation;
        close?.();
        setProblem("Music server updates disconnected. Reconnecting.");
        timer = setTimeout(connect, 1500);
      });
    };
    connect();
    return () => { active = false; ++generation; clearTimeout(timer); close?.(); };
  }, [authorized]);
  const controller = useMemo(() => target !== "" && authorized ? new ServerPlayerSession(target, playerApi, { onJoined }) : null, [target, authorized, onJoined]);
  useEffect(() => controller?.start(), [controller]);
  useEffect(() => {
    const join = pendingJoin.current;
    if (!controller || join?.id !== controller.id) return;
    pendingJoin.current = null;
    // The local queue is cleared only once its tracks are safely on the server.
    void controller.join(join.tracks.map(({ track_id, friend_id }) => ({ track_id, friend_id })));
  }, [controller]);
  const remote = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const remember = (next: string) => {
    setTarget(next);
    try { localStorage.setItem(storageKey, next); } catch { /* optional preference */ }
  };
  /**
   * Join a server from this device: its upcoming local tracks are appended to
   * the server queue (an idle server starts playing them), then the local
   * queue is cleared so only one queue is in view. Moving between servers
   * carries nothing over; the server keeps the queue whoever leaves.
   */
  const join = (id: string) => {
    if (!playerIdSchema.safeParse(id).success || id === target) return;
    if (target === "") {
      const tracks = upcomingLocalTracks(local);
      local.pause();
      pendingJoin.current = tracks.length ? { id, tracks } : null;
    } else pendingJoin.current = null;
    remember(id);
  };
  /** Back to this device. The server is never sent a command: it keeps playing its queue. */
  const playHere = () => { pendingJoin.current = null; remember(""); };
  const select = (next: string) => next === "" ? playHere() : join(next);
  const unlock = async (passphrase: string) => {
    try { await playerApi.unlock(passphrase); setAuthorized(true); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Unable to unlock players"); }
  };
  const lock = async () => {
    try { await playerApi.lock(); setAuthorized(false); setPlayers([]); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Unable to lock players"); }
  };
  return { target, select, join, playHere, airPlayActive: local.isAirPlayActive, players, authorized, unlock, lock, problem, reportProblem: setProblem, loadPlayers, controller, remote };
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
    const entries = tracks.map(({ track_id, friend_id }) => ({ id: crypto.randomUUID(), track_id, friend_id }));
    const offset = options.startIndex ?? (options.startTrackId ? Math.max(0, tracks.findIndex(track => track.track_id === options.startTrackId)) : 0);
    await controller.command({ type: "queue.replace", entries, current_entry_id: entries[offset]?.id ?? entries[0]!.id, position: 0, play: options.autoplay === true });
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
