import { normalizeAlbumTrackSides } from "@/lib/albumTrackPosition";
import { camelotOf, parseBpm } from "@/lib/mixCompat";
import { formatSeconds, getTrackDurationSeconds } from "@/lib/trackUtils";

type StatTrack = {
  position?: string | number | null;
  bpm?: number | string | null;
  key?: string | null;
  duration?: string | null;
  duration_seconds?: number | null;
};

export type SideSummary<T> = {
  key: string;
  label: string;
  /** "A" for "Side A", the label itself when the group isn't a lettered side. */
  shortLabel: string;
  tracks: T[];
  /** Seconds across the tracks that have a duration. */
  seconds: number;
};

const sumSeconds = (tracks: StatTrack[]) =>
  tracks.reduce((total, track) => total + (getTrackDurationSeconds(track) ?? 0), 0);

/** The album's tracks grouped by side (or disc), each with its runtime. */
export function summarizeSides<
  T extends StatTrack & { position: string | number | null | undefined },
>(tracks: T[]): SideSummary<T>[] {
  return normalizeAlbumTrackSides(tracks).map((group) => ({
    key: group.side_key,
    label: group.side_label,
    shortLabel: group.side_label.replace(/^(Side|Disc) /, ""),
    tracks: group.tracks,
    seconds: sumSeconds(group.tracks),
  }));
}

/** Whether the groups are real sides/discs rather than one undivided tracklist. */
export function hasSides(sides: SideSummary<unknown>[]): boolean {
  return sides.some((side) => side.key !== "TRACKLIST");
}

/** "A 21:41 · B 20:44"; empty when there is only one group or no durations. */
export function formatSideRuntimes(sides: SideSummary<unknown>[]): string {
  if (sides.length < 2) return "";
  return sides
    .filter((side) => side.seconds > 0)
    .map((side) => `${side.shortLabel} ${formatSeconds(side.seconds)}`)
    .join(" · ");
}

/** "6 + 6" for a two-sided record; the count alone adds nothing for one group. */
export function formatSideSplit(sides: SideSummary<unknown>[]): string {
  if (sides.length < 2) return "";
  return sides.map((side) => side.tracks.length).join(" + ");
}

/** The slowest and fastest tempo among tracks that have one. */
export function bpmRange(tracks: StatTrack[]): { min: number; max: number } | null {
  const bpms = tracks
    .map((track) => parseBpm(track.bpm))
    .filter((bpm): bpm is number => bpm !== null);
  if (bpms.length === 0) return null;
  return { min: Math.min(...bpms), max: Math.max(...bpms) };
}

/** `94–150`, or a single number when the tempo doesn't move. */
export function formatBpmRange(range: { min: number; max: number } | null): string | null {
  if (!range) return null;
  const min = Math.round(range.min);
  const max = Math.round(range.max);
  return min === max ? String(min) : `${min}–${max}`;
}

/** The Camelot code of the first track (in play order) that has a recognisable key. */
export function openingKey(tracks: StatTrack[]): { camelot: string; name: string } | null {
  for (const track of tracks) {
    const camelot = camelotOf(track.key);
    if (camelot && track.key) return { camelot, name: track.key };
  }
  return null;
}

export type SpinStats = {
  count: number;
  /** The count hit the page size, so there may be more spins than it shows. */
  capped: boolean;
  lastPlayedAt: string | null;
};

type StatSpin = { session: { played_at: string } };

/** Spin count and the most recent play from a page of spins. */
export function summarizeSpinStats(spins: StatSpin[], pageSize: number): SpinStats {
  let last: number | null = null;
  let lastPlayedAt: string | null = null;
  for (const { session } of spins) {
    const time = new Date(session.played_at).getTime();
    if (Number.isFinite(time) && (last === null || time > last)) {
      last = time;
      lastPlayedAt = session.played_at;
    }
  }
  return { count: spins.length, capped: spins.length >= pageSize, lastPlayedAt };
}

/** `1 spin`, `3 spins`, `8+ spins`. */
export function formatSpinCount({ count, capped }: Pick<SpinStats, "count" | "capped">): string {
  return `${count}${capped ? "+" : ""} ${count === 1 && !capped ? "spin" : "spins"}`;
}
