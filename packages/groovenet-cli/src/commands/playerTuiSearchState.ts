import { useEffect, useRef, useState } from "react";
import type { Album, AlbumDetail, GroovenetClient, Track, TrackSearchMode } from "@groovenet/client";
import type { PlaybackSnapshot, QueueEntry } from "@groovenet/player";
import type { PlayerController } from "./remotePlayer.js";
import type { ActionId } from "./playerKeymapRegistry.js";

export const SEARCH_DELAY = 250;
export const SEARCH_MODES: TrackSearchMode[] = ["lexical", "semantic", "hybrid"];
export const modeLabel = (mode: TrackSearchMode) => mode === "lexical" ? "KEYWORD" : mode.toUpperCase();
/** Discogs positions are strings (A1, A2, A10); retain server order where positions are absent. */
export function orderedAlbumTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.position == null || b.position == null ? 0 : String(a.position).localeCompare(String(b.position), "en", { numeric: true }));
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
type Results<T> = { items: T[]; total: number; loading: boolean; error: string; degraded?: boolean };
const empty = <T,>(): Results<T> => ({ items: [], total: 0, loading: false, error: "" });

/** Append without disturbing existing entries, then play the first new entry by its identity. */
export async function queueSearchTracks(control: PlayerController, tracks: Track[], play: boolean, remote: boolean): Promise<void> {
  if (!tracks.length) throw new Error("No tracks in this album.");
  const before = play ? await control.request<QueueEntry[]>("queue.list") : [];
  let firstId: string | undefined;
  for (const track of tracks) {
    const result = await control.request<QueueEntry[] | PlaybackSnapshot>("queue.addTrack", { track });
    if (play && !firstId) {
      const entries = Array.isArray(result) ? result : result.queue;
      firstId = entries.find((entry) => !before.some((old) => old.id === entry.id))?.id;
    }
  }
  if (play) {
    const queue = await control.request<QueueEntry[]>("queue.list");
    const index = queue.findIndex((entry) => entry.id === firstId);
    if (index < 0) throw new Error("Added track is no longer in the queue. Select it from the queue to play.");
    await control.request("play", remote ? { id: firstId } : { index });
  }
}

export function usePlayerSearch(api: GroovenetClient, active: boolean, initialQuery: string, enqueue: (tracks: Track[], play: boolean) => Promise<void>, friendId?: number) {
  const [query, setQuery] = useState(initialQuery);
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<"tracks" | "albums">("tracks");
  const [mode, setMode] = useState<TrackSearchMode>("lexical");
  const [tracks, setTracks] = useState<Results<Track>>(empty);
  const [albums, setAlbums] = useState<Results<Album>>(empty);
  const [trackIndex, setTrackIndex] = useState(0);
  const [albumIndex, setAlbumIndex] = useState(0);
  const [openedIndex, setOpenedIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(0);
  const immediate = useRef(!!initialQuery);
  const cache = useRef(new Map<string, AlbumDetail>());

  // Independent requests let one scope remain usable when the other endpoint fails.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setTrackIndex(0); setOpened(false); setMessage("");
    if (!query.trim()) { setTracks(empty()); return; }
    setTracks({ ...empty(), loading: true });
    const request = () => {
      void api.searchTracks({ query, limit: 30, mode, ...(friendId === undefined ? {} : { filters: { friend_id: friendId } }) }).then((result) => {
        if (!cancelled) setTracks({ items: result.tracks, total: result.estimatedTotalHits ?? result.tracks.length, loading: false, error: "", degraded: result.degraded });
      }).catch((error: unknown) => { if (!cancelled) setTracks({ ...empty(), error: errorText(error) }); });
    };
    const timer = immediate.current ? (request(), undefined) : setTimeout(request, SEARCH_DELAY);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, active, query, mode, submitted, friendId]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setAlbumIndex(0); setOpened(false);
    if (!query.trim()) { setAlbums(empty()); return; }
    setAlbums({ ...empty(), loading: true });
    const request = () => {
      void api.searchAlbums({ q: query, limit: 30, ...(friendId === undefined ? {} : { friend_id: friendId }) }).then((result) => {
        if (!cancelled) setAlbums({ items: result.hits, total: result.estimatedTotalHits, loading: false, error: "" });
      }).catch((error: unknown) => { if (!cancelled) setAlbums({ ...empty(), error: errorText(error) }); });
    };
    const timer = immediate.current ? (request(), undefined) : setTimeout(request, SEARCH_DELAY);
    immediate.current = false;
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, active, query, submitted, friendId]);

  const album = scope === "albums" ? albums.items[albumIndex] : undefined;
  useEffect(() => {
    setDetail(null); setDetailError(""); setDetailLoading(false);
    if (!active || !album) return;
    const key = `${album.friend_id}:${album.release_id}`;
    const cached = cache.current.get(key);
    if (cached) { setDetail(cached); return; }
    let cancelled = false;
    setDetailLoading(true);
    void api.getAlbum(album.release_id, album.friend_id).then((result) => {
      if (!cancelled) {
        const ordered = { ...result, tracks: orderedAlbumTracks(result.tracks) };
        cache.current.set(key, ordered); setDetail(ordered); setDetailLoading(false);
      }
    }).catch((error: unknown) => {
      if (!cancelled) { setDetailError(errorText(error)); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [api, active, album]);

  const results = scope === "tracks" ? tracks : albums;
  const selected = opened ? openedIndex : scope === "tracks" ? trackIndex : albumIndex;
  const count = opened ? detail?.tracks.length ?? 0 : results.items.length;
  function move(delta: number) {
    setEditing(false);
    const update = (index: number) => Math.max(0, Math.min(Math.max(0, count - 1), index + delta));
    if (opened) setOpenedIndex(update); else if (scope === "tracks") setTrackIndex(update); else setAlbumIndex(update);
  }
  async function perform(play: boolean) {
    if (busyRef.current || results.loading) return;
    const chosen = scope === "tracks" ? [tracks.items[trackIndex]].filter((track): track is Track => !!track)
      : opened ? [detail?.tracks[openedIndex]].filter((track): track is Track => !!track) : detail?.tracks ?? [];
    if (!chosen.length) { setMessage(detailError || (detailLoading ? "Loading album…" : "No tracks available.")); return; }
    busyRef.current = true; setBusy(true); setMessage("");
    try { await enqueue(chosen, play); setMessage(play ? `Playing ${chosen[0].title}` : `Added ${chosen.length} ${chosen.length === 1 ? "track" : "tracks"} to queue.`); }
    catch (error) { setMessage(errorText(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function handle(id: ActionId): boolean {
    switch (id) {
      case "view.search": setEditing(true); setOpened(false); return true;
      case "input.submit":
        setEditing(false);
        if (query.trim() && (tracks.loading || albums.loading)) {
          immediate.current = true; setSubmitted((value) => value + 1);
        }
        return true;
      case "input.cancel":
        if (editing) setEditing(false);
        else if (opened) setOpened(false);
        else setQuery("");
        setMessage(""); return true;
      case "input.backspace": setQuery((value) => Array.from(value).slice(0, -1).join("")); return true;
      case "list.up": move(editing ? 0 : -1); return true;
      case "list.down": move(editing ? 0 : 1); return true;
      case "search.scope": setScope((value) => value === "tracks" ? "albums" : "tracks"); setOpened(false); setMessage(""); return true;
      case "search.mode": if (scope === "tracks") setMode(SEARCH_MODES[(SEARCH_MODES.indexOf(mode) + 1) % SEARCH_MODES.length]); return true;
      case "nav.open": if (album && detail) { setOpened(true); setOpenedIndex(0); } return true;
      case "list.select": void perform(true); return true;
      case "queue.add": void perform(false); return true;
      default: return false;
    }
  }
  return { query, setQuery, editing, scope, mode, tracks, albums, selected, opened, album, detail, detailError, detailLoading, busy, message, handle, count };
}
export type PlayerSearch = ReturnType<typeof usePlayerSearch>;
