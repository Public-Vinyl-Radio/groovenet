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
