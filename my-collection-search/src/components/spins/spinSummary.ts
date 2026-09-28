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
      ? { label: "Auto · corrected", description: `${detected} · corrected by hand`, automatic: true }
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

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (localDayKey(date) === localDayKey(now)) return "Today";
  if (localDayKey(date) === localDayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Groups spins, already newest first, by the local day they were played. */
export function groupSpinsByDay(items: SpinListItem[], now: Date = new Date()): SpinDayGroup[] {
  const groups: SpinDayGroup[] = [];
  for (const item of items) {
    const playedAt = new Date(item.session.played_at);
    const key = localDayKey(playedAt);
    const current = groups[groups.length - 1];
    if (current?.key === key) {
      current.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(playedAt, now), items: [item] });
    }
  }
  return groups;
}
