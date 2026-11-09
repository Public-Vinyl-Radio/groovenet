import type { Album, Track } from "@/types/track";

/** Recent opens and searches live on the device only (#1145): no API, a short cap. */
export const RECENT_CAP = 8;
const OPENS_KEY = "groovenet:palette:recent-opens";
const SEARCHES_KEY = "groovenet:palette:recent-searches";

export type RecentOpen = { kind: "track"; track: Track } | { kind: "album"; album: Album };

// Enough to draw a row and act on it; the rest of a hit is not worth storing.
const TRACK_FIELDS = [
  "track_id",
  "friend_id",
  "title",
  "artist",
  "album",
  "bpm",
  "key",
  "duration",
  "duration_seconds",
  "local_audio_url",
  "album_thumbnail",
  "audio_file_album_art_url",
] as const;
const ALBUM_FIELDS = [
  "release_id",
  "friend_id",
  "title",
  "artist",
  "year",
  "track_count",
  "album_thumbnail",
] as const;

function pick<T extends object>(source: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = (source as Record<string, unknown>)[field];
    if (value !== undefined) out[field] = value;
  }
  return out as T;
}

function read(key: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value.slice(0, RECENT_CAP)));
  } catch {
    // Storage can be full, blocked or absent; recents are a convenience.
  }
}

const identity = (open: RecentOpen) =>
  open.kind === "track"
    ? `track:${open.track.track_id}:${open.track.friend_id}`
    : `album:${open.album.release_id}:${open.album.friend_id}`;

const isRecentOpen = (value: unknown): value is RecentOpen => {
  const entry = value as Partial<RecentOpen> | null;
  if (!entry || typeof entry !== "object") return false;
  if (entry.kind === "track") return Boolean((entry as { track?: unknown }).track);
  if (entry.kind === "album") return Boolean((entry as { album?: unknown }).album);
  return false;
};

export function readRecentOpens(): RecentOpen[] {
  return read(OPENS_KEY).filter(isRecentOpen);
}

export function recordRecentOpen(open: RecentOpen) {
  const slim: RecentOpen =
    open.kind === "track"
      ? { kind: "track", track: pick(open.track, TRACK_FIELDS) }
      : { kind: "album", album: pick(open.album, ALBUM_FIELDS) };
  write(OPENS_KEY, [slim, ...readRecentOpens().filter((o) => identity(o) !== identity(slim))]);
}

export function readRecentSearches(): string[] {
  return read(SEARCHES_KEY).filter((q): q is string => typeof q === "string" && q.length > 0);
}

export function recordRecentSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  write(SEARCHES_KEY, [
    q,
    ...readRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase()),
  ]);
}
