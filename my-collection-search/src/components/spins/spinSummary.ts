import { getTrackSideLabel } from "@/lib/albumTrackPosition";
import type { SpinListResponse } from "@/services/internalApi/spins";

export type SpinListItem = SpinListResponse["items"][number];

export type SpinTrackLine = {
  key: string;
  position: string | null;
  title: string;
};

export type SpinSummary = {
  /** What was played, in one line: "D2 · Tipo Raro", "Side A, Side B", "Full album". */
  headline: string;
  /** Every track the spin counted, in play order. */
  tracks: SpinTrackLine[];
  /** True when the headline doesn't already name every track. */
  hasMoreTracks: boolean;
};

// A headline names up to this many tracks; beyond that it shows the first and "+N more".
const HEADLINE_TRACK_LIMIT = 2;

export function formatTrackLine(track: Pick<SpinTrackLine, "position" | "title">): string {
  return track.position ? `${track.position} · ${track.title}` : track.title;
}

function sideLabelFor(sideKey: string, item: SpinListItem): string {
  if (sideKey === "TRACKLIST") return "Tracklist";
  // The side's display label ("Side A", "Disc 1") is derived from a track
  // position, so borrow one from a track the spin recorded on that side.
  const event = item.track_events.find((e) => e.side_key === sideKey);
  return (event && getTrackSideLabel(event.position_snapshot ?? null)) ?? `Side ${sideKey}`;
}

export function summarizeSpin(item: SpinListItem): SpinSummary {
  const tracks: SpinTrackLine[] = [...item.track_events]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((event) => ({
      key: `${event.track_id}:${event.ordinal}`,
      position: event.position_snapshot ?? null,
      title: event.title_snapshot || "Unknown track",
    }));

  if (item.derived.is_full_album_spin) {
    return { headline: "Full album", tracks, hasMoreTracks: tracks.length > 0 };
  }

  if (item.session.selection_mode === "sides") {
    const sideKeys = item.selections
      .filter((s) => s.selection_type === "side" && s.side_key)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => s.side_key as string);
    if (sideKeys.length > 0) {
      return {
        headline: sideKeys.map((key) => sideLabelFor(key, item)).join(", "),
        tracks,
        hasMoreTracks: tracks.length > 0,
      };
    }
  }

  if (tracks.length === 0) {
    return { headline: "No tracks recorded", tracks, hasMoreTracks: false };
  }

  if (tracks.length <= HEADLINE_TRACK_LIMIT) {
    return { headline: tracks.map(formatTrackLine).join(", "), tracks, hasMoreTracks: false };
  }
  return {
    headline: `${formatTrackLine(tracks[0])} +${tracks.length - 1} more`,
    tracks,
    hasMoreTracks: true,
  };
}

export type SpinProvenance = {
  label: "Auto" | "Auto · corrected" | "Manual";
  description: string;
  automatic: boolean;
};

export function describeProvenance(item: SpinListItem): SpinProvenance {
  if (item.session.provenance === "automatic") {
    const confidence = item.session.confidence;
    const detected =
      typeof confidence === "number"
        ? `Detected by the listener · ${Math.round(confidence * 100)}% confidence`
        : "Detected by the listener";
    return item.session.corrected_at
      ? {
          label: "Auto · corrected",
          description: `${detected} · corrected by hand`,
          automatic: true,
        }
      : { label: "Auto", description: detected, automatic: true };
  }
  return { label: "Manual", description: "Logged by hand", automatic: false };
}

export type SpinAlbum = {
  title: string | null;
  artist: string | null;
  thumbnail: string | null;
};

/** The album a spin belongs to, from the album row, else the event snapshots. */
export function describeSpinAlbum(item: SpinListItem): SpinAlbum {
  const firstEvent = item.track_events[0];
  return {
    title: item.album?.title ?? firstEvent?.album_snapshot ?? null,
    artist: item.album?.artist ?? firstEvent?.artist_snapshot ?? null,
    thumbnail: item.album?.thumbnail ?? null,
  };
}

export type SpinDayGroup = {
  key: string;
  label: string;
  items: SpinListItem[];
};

/** A spin's time in the configured zone: just the time, or date and time. */
export function formatPlayedAt(dateString: string, timeOnly: boolean, timeZone: string): string {
  const date = new Date(dateString);
  return timeOnly
    ? date.toLocaleTimeString([], { timeStyle: "short", timeZone })
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone });
}

type DayParts = { year: number; month: number; day: number };

function dayParts(date: Date, timeZone: string): DayParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function dayKey({ year, month, day }: DayParts): string {
  return `${year}-${month}-${day}`;
}

// The calendar day before, by calendar arithmetic so a DST change can't skew it.
function previousDay({ year, month, day }: DayParts): DayParts {
  const d = new Date(Date.UTC(year, month - 1, day - 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayLabel(date: Date, parts: DayParts, nowParts: DayParts, timeZone: string): string {
  const key = dayKey(parts);
  if (key === dayKey(nowParts)) return "Today";
  if (key === dayKey(previousDay(nowParts))) return "Yesterday";
  return date.toLocaleDateString([], {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(parts.year === nowParts.year ? {} : { year: "numeric" }),
  });
}

/** Groups spins, already newest first, by the day they were played in `timeZone`. */
export function groupSpinsByDay(
  items: SpinListItem[],
  timeZone: string,
  now: Date = new Date(),
): SpinDayGroup[] {
  const nowParts = dayParts(now, timeZone);
  const groups: SpinDayGroup[] = [];
  for (const item of items) {
    const playedAt = new Date(item.session.played_at);
    const parts = dayParts(playedAt, timeZone);
    const key = dayKey(parts);
    const current = groups[groups.length - 1];
    if (current?.key === key) {
      current.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(playedAt, parts, nowParts, timeZone), items: [item] });
    }
  }
  return groups;
}

// ── Listening log (#863) ────────────────────────────────────────────────────
// A list item is a spin session (one side or play of a record) with its track
// events. The log shows each track event as a "play", then groups plays into
// listening sessions and, inside those, runs of one record.

/** Plays at most this far apart belong to one listening session. */
export const LISTENING_SESSION_GAP_MS = 20 * 60_000;

export type SpinMediumValue = SpinListItem["session"]["medium"];

export type SpinPlay = {
  key: string;
  /** The spin session this play was logged in; edits and deletes act on it. */
  item: SpinListItem;
  playedAt: string;
  medium: SpinMediumValue;
  releaseId: string;
  position: string | null;
  title: string;
  artist: string | null;
  record: string | null;
  thumbnail: string | null;
};

export type SpinRecordGroup = {
  key: string;
  releaseId: string;
  medium: SpinMediumValue;
  record: string | null;
  artist: string | null;
  thumbnail: string | null;
  /** Newest first. */
  plays: SpinPlay[];
};

export type ListeningSessionMedium = SpinMediumValue | "mixed";

export type ListeningSession = {
  key: string;
  /** The oldest play's time. */
  start: string;
  /** The newest play's time. */
  end: string;
  /** Newest first. */
  plays: SpinPlay[];
  records: SpinRecordGroup[];
  recordCount: number;
  medium: ListeningSessionMedium;
};

export type ListeningLogDay = {
  key: string;
  /** "Today", "Yesterday" or the weekday. */
  label: string;
  /** "TUE OCT 27", with the year when it isn't this year's. */
  date: string;
  sessions: ListeningSession[];
  spinCount: number;
  recordCount: number;
};

/** A session's plays, newest first: one per track event, else the session's own summary. */
export function spinPlays(item: SpinListItem): SpinPlay[] {
  const album = describeSpinAlbum(item);
  const base = {
    item,
    medium: item.session.medium,
    releaseId: item.session.release_id,
    thumbnail: album.thumbnail,
  };
  if (item.track_events.length === 0) {
    return [
      {
        ...base,
        key: `${item.session.id}`,
        playedAt: item.session.played_at,
        position: null,
        title: summarizeSpin(item).headline,
        artist: album.artist,
        record: album.title,
      },
    ];
  }
  return [...item.track_events]
    .sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at) || b.ordinal - a.ordinal)
    .map((event) => ({
      ...base,
      key: `${item.session.id}:${event.ordinal}`,
      playedAt: event.played_at,
      position: event.position_snapshot ?? null,
      title: event.title_snapshot || "Unknown track",
      artist: album.artist ?? event.artist_snapshot ?? null,
      record: album.title ?? event.album_snapshot ?? null,
    }));
}

/** Runs of consecutive plays from one record, in the order given. */
export function groupPlaysByRecord(plays: SpinPlay[]): SpinRecordGroup[] {
  const groups: SpinRecordGroup[] = [];
  for (const play of plays) {
    const current = groups[groups.length - 1];
    if (current && current.releaseId === play.releaseId && current.medium === play.medium) {
      current.plays.push(play);
    } else {
      groups.push({
        key: play.key,
        releaseId: play.releaseId,
        medium: play.medium,
        record: play.record,
        artist: play.artist,
        thumbnail: play.thumbnail,
        plays: [play],
      });
    }
  }
  return groups;
}

function buildSession(plays: SpinPlay[]): ListeningSession {
  const media = new Set(plays.map((play) => play.medium));
  return {
    key: plays[plays.length - 1].key,
    start: plays[plays.length - 1].playedAt,
    end: plays[0].playedAt,
    plays,
    records: groupPlaysByRecord(plays),
    recordCount: new Set(plays.map((play) => play.releaseId)).size,
    medium: media.size > 1 ? "mixed" : plays[0].medium,
  };
}

/** Splits spins, newest first, into listening sessions of plays at most `gapMs` apart. */
export function groupListeningSessions(
  items: SpinListItem[],
  gapMs: number = LISTENING_SESSION_GAP_MS,
): ListeningSession[] {
  // Sessions are newest first, but one can start before an older one's last
  // track, so order the plays themselves; the sort is stable for ties.
  const plays = items
    .flatMap(spinPlays)
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
  const sessions: ListeningSession[] = [];
  let current: SpinPlay[] = [];
  for (const play of plays) {
    const newer = current[current.length - 1];
    if (newer && Date.parse(newer.playedAt) - Date.parse(play.playedAt) > gapMs) {
      sessions.push(buildSession(current));
      current = [];
    }
    current.push(play);
  }
  if (current.length > 0) sessions.push(buildSession(current));
  return sessions;
}

function logDateLabel(date: Date, parts: DayParts, nowParts: DayParts, timeZone: string): string {
  return date
    .toLocaleDateString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(parts.year === nowParts.year ? {} : { year: "numeric" }),
    })
    .replace(/,/g, "")
    .toUpperCase();
}

function logDayLabel(date: Date, parts: DayParts, nowParts: DayParts, timeZone: string): string {
  const key = dayKey(parts);
  if (key === dayKey(nowParts)) return "Today";
  if (key === dayKey(previousDay(nowParts))) return "Yesterday";
  return date.toLocaleDateString("en-US", { timeZone, weekday: "long" });
}

/**
 * The listening log: days in `timeZone`, each with its listening sessions. A
 * session that runs past midnight stays under the day it started.
 */
export function groupListeningLog(
  items: SpinListItem[],
  timeZone: string,
  now: Date = new Date(),
  gapMs: number = LISTENING_SESSION_GAP_MS,
): ListeningLogDay[] {
  const nowParts = dayParts(now, timeZone);
  const days: ListeningLogDay[] = [];
  for (const session of groupListeningSessions(items, gapMs)) {
    const start = new Date(session.start);
    const parts = dayParts(start, timeZone);
    const key = dayKey(parts);
    let day = days[days.length - 1];
    if (day?.key !== key) {
      day = {
        key,
        label: logDayLabel(start, parts, nowParts, timeZone),
        date: logDateLabel(start, parts, nowParts, timeZone),
        sessions: [],
        spinCount: 0,
        recordCount: 0,
      };
      days.push(day);
    }
    day.sessions.push(session);
    day.spinCount += session.plays.length;
    day.recordCount = new Set(
      day.sessions.flatMap((s) => s.plays.map((play) => play.releaseId)),
    ).size;
  }
  return days;
}

/** "7:16 PM", in the configured zone. */
export function formatClockTime(dateString: string, timeZone: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** "7:16 PM–7:38 PM", or one time when both ends match. */
export function formatTimeRange(start: string, end: string, timeZone: string): string {
  const from = formatClockTime(start, timeZone);
  const to = formatClockTime(end, timeZone);
  return from === to ? from : `${from}–${to}`;
}

/** "A1–A3", or the one position; null when no play has one. */
export function formatPositionRange(plays: SpinPlay[]): string | null {
  const positions = plays.map((play) => play.position).filter((p): p is string => Boolean(p));
  if (positions.length === 0) return null;
  const first = positions[positions.length - 1];
  const last = positions[0];
  return first === last ? first : `${first}–${last}`;
}
