import type { Playlist } from "@/types/track";

export interface PlaylistMonthGroup {
  /** `YYYY-MM`, or `undated` for playlists without a usable date. */
  key: string;
  /** Divider tab text, e.g. `AUG 2026`. */
  label: string;
  playlists: Playlist[];
  playlistCount: number;
  setCount: number;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** The date a playlist sits at on the timeline: when it was played, else created. */
export function playlistTimelineDate(playlist: Playlist): Date | null {
  const raw = playlist.set?.last_performed_at || playlist.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Day column parts for a playlist: `{ day: "10", weekday: "MON" }`. */
export function playlistDayParts(playlist: Playlist): { day: string; weekday: string } | null {
  const date = playlistTimelineDate(playlist);
  if (!date) return null;
  return { day: String(date.getDate()), weekday: WEEKDAYS[date.getDay()] };
}

/** `2 playlists · 2 sets`; the set count is left out when there are none. */
export function formatGroupCount(
  group: Pick<PlaylistMonthGroup, "playlistCount" | "setCount">,
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return group.setCount > 0
    ? `${plural(group.playlistCount, "playlist")} · ${plural(group.setCount, "set")}`
    : plural(group.playlistCount, "playlist");
}

/**
 * Buckets playlists by calendar month in local time, newest month first and
 * newest playlist first within it. Undated playlists collect in a last group.
 */
export function groupPlaylistsByMonth(playlists: Playlist[]): PlaylistMonthGroup[] {
  const dated: Array<{ playlist: Playlist; date: Date }> = [];
  const undated: Playlist[] = [];
  for (const playlist of playlists) {
    const date = playlistTimelineDate(playlist);
    if (date) dated.push({ playlist, date });
    else undated.push(playlist);
  }
  dated.sort((a, b) => b.date.getTime() - a.date.getTime());

  const groups = new Map<string, PlaylistMonthGroup>();
  const add = (key: string, label: string, playlist: Playlist) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, label, playlists: [], playlistCount: 0, setCount: 0 };
      groups.set(key, group);
    }
    group.playlists.push(playlist);
    group.playlistCount += 1;
    if (playlist.set) group.setCount += 1;
  };

  for (const { playlist, date } of dated) {
    const month = date.getMonth();
    add(
      `${date.getFullYear()}-${String(month + 1).padStart(2, "0")}`,
      `${MONTHS[month]} ${date.getFullYear()}`,
      playlist,
    );
  }
  for (const playlist of undated) add("undated", "UNDATED", playlist);
  return [...groups.values()];
}
