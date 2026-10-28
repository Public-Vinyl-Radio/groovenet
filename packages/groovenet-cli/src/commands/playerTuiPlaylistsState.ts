import { useEffect, useMemo, useRef, useState } from "react";
import { formatSeconds, type GroovenetClient, type Playlist, type Track } from "@groovenet/client";
import type { QueueEntry } from "@groovenet/player";
import type { ActionId } from "./playerKeymapRegistry.js";
import type { PlayerController } from "./remotePlayer.js";

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Match the web playlist timeline: last performance, otherwise creation, in local time. */
export function playlistDate(playlist: Playlist): Date | null {
  const raw = playlist.set?.last_performed_at || playlist.created_at;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function playlistDuration(playlist: Playlist): string {
  return playlist.total_duration_seconds == null ? "--:--" : formatSeconds(playlist.total_duration_seconds);
}
export function playlistGroups(playlists: Playlist[], query: string) {
  const sorted = playlists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (playlistDate(b)?.getTime() ?? -Infinity) - (playlistDate(a)?.getTime() ?? -Infinity));
  const groups = new Map<string, { label: string; playlists: Playlist[] }>();
  for (const playlist of sorted) {
    const date = playlistDate(playlist);
    const label = date ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase() : "UNDATED";
    if (!groups.has(label)) groups.set(label, { label, playlists: [] });
    groups.get(label)!.playlists.push(playlist);
  }
  return [...groups.values()];
}

/** No implicit availability acknowledgements: the remote controller applies the user's policy. */
export async function queuePlaylist(control: PlayerController, playlist: Playlist, tracks: Track[], play: boolean, remote: boolean): Promise<void> {
  if (!tracks.length) throw new Error("No tracks in this playlist.");
  if (!play) { await control.request("queue.add", { playlistId: String(playlist.id) }); return; }
  if (remote) {
    await control.request("queue.replace", { entries: tracks.map(({ track_id, friend_id }) => ({ track_id, friend_id })), play: true });
    return;
  }
  // The local protocol has stop/remove/add, but no queue.clear or queue.replace.
  // Resolve the entire playlist before calling this function; failures stop the sequence.
  const before = await control.request<QueueEntry[]>("queue.list");
  await control.request("stop");
  for (const entry of before) await control.request("queue.remove", { id: entry.id });
  for (const track of tracks) await control.request("queue.addTrack", { track });
  await control.request("play", { index: 0 });
}

export function usePlayerPlaylists(api: GroovenetClient, active: boolean, enqueue: (playlist: Playlist, tracks: Track[], play: boolean) => Promise<void>) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const groups = useMemo(() => playlistGroups(playlists, query), [playlists, query]);
  const filtered = groups.flatMap((group) => group.playlists);
  const playlist = filtered[index];

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true); setError("");
    void api.listPlaylists().then((result) => {
      if (!cancelled) { setPlaylists(result); setLoading(false); }
    }).catch((error: unknown) => {
      if (!cancelled) { setError(errorText(error)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [api, active]);

  useEffect(() => {
    setTracks([]); setDetailError(""); setDetailLoading(false);
    if (!active || !playlist || loading || error) return;
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      const { track_refs } = await api.getPlaylistTracks(playlist.id);
      const refs = [...track_refs].sort((a, b) => a.position - b.position);
      const found = refs.length ? await api.batchGetTracks(refs) : [];
      const byRef = new Map(found.map((track) => [`${track.friend_id}:${track.track_id}`, track]));
      const ordered = refs.map((ref) => byRef.get(`${ref.friend_id}:${ref.track_id}`));
      if (ordered.some((track) => !track)) throw new Error("Playlist contains unavailable tracks. Refresh playlists and try again.");
      if (!cancelled) { setTracks(ordered as Track[]); setDetailLoading(false); }
    })().catch((error: unknown) => {
      if (!cancelled) { setDetailError(errorText(error)); setDetailLoading(false); }
    });
    return () => { cancelled = true; };
  }, [api, active, playlist, loading, error]);

  // Ignore action notices from a view/selection that has since been left.
  useEffect(() => { generation.current++; setMessage(""); }, [active, playlist, opened]);
  useEffect(() => { setIndex((index) => Math.min(index, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  useEffect(() => {
    if (!detailLoading && tracks.length && trackIndex >= tracks.length) setTrackIndex(tracks.length - 1);
  }, [detailLoading, tracks.length, trackIndex]);

  async function perform(play: boolean) {
    if (busyRef.current || !playlist || loading || error) return;
    if (detailLoading || detailError || !tracks.length) {
      setMessage(detailError || (detailLoading ? "Loading playlist…" : "No tracks in this playlist.")); return;
    }
    const current = generation.current;
    busyRef.current = true; setBusy(true); setMessage("");
    try {
      await enqueue(playlist, tracks, play);
      if (generation.current === current) setMessage(play ? `Playing ${playlist.name}` : `Added ${tracks.length} tracks to queue.`);
    } catch (error) { if (generation.current === current) setMessage(errorText(error)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  function move(delta: number) {
    setEditing(false);
    const clamp = (value: number) => Math.max(0, Math.min(Math.max(0, (opened ? tracks.length : filtered.length) - 1), value + delta));
    if (opened) setTrackIndex(clamp); else setIndex(clamp);
  }
  function handle(id: ActionId): boolean {
    switch (id) {
      case "playlists.filter": setOpened(false); setEditing(true); setMessage(""); return true;
      case "input.submit": setEditing(false); return true;
      case "input.cancel":
        if (editing) setEditing(false);
        else if (opened) setOpened(false);
        else { setQuery(""); setIndex(0); }
        setMessage(""); return true;
      case "input.backspace": updateQuery(Array.from(query).slice(0, -1).join("")); return true;
      case "list.up": move(editing ? 0 : -1); return true;
      case "list.down": move(editing ? 0 : 1); return true;
      case "nav.open": if (playlist) { setOpened(true); setTrackIndex(0); } return true;
      case "list.select": void perform(true); return true;
      case "queue.add": void perform(false); return true;
      default: return false;
    }
  }
  function updateQuery(value: string | ((query: string) => string)) { setQuery(value); setIndex(0); setOpened(false); setMessage(""); }
  return { playlists, groups, playlist, loading, error, query, updateQuery, editing, opened, selected: opened ? trackIndex : index, count: opened ? tracks.length : filtered.length, tracks, detailLoading, detailError, busy, message, handle };
}
export type PlayerPlaylists = ReturnType<typeof usePlayerPlaylists>;
