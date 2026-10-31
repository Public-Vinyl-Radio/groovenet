// Wording for Home's Playlists & sets (#884), kept pure so it can be tested on its own.

import { daysSince } from "./arrivalWording";

/** Relative "CREATED N DAYS AGO" up to this many days; a date past it. */
const RELATIVE_DAYS = 7;

/** "1 TRACK" / "N TRACKS". */
export function tracksLabel(trackCount: number): string {
  return trackCount === 1 ? "1 TRACK" : `${trackCount.toLocaleString("en-US")} TRACKS`;
}

/**
 * "H:MM:SS" for the known durations; "≈" when some tracks have none, as the
 * monthly recap marks its hours.
 */
export function durationLabel(seconds: number, knownShare: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${knownShare < 1 ? "≈" : ""}${h}:${mm}:${ss}`;
}

/** "N TRACKS · H:MM:SS". */
export function tracksAndDuration(item: {
  track_count: number;
  duration_seconds: number;
  duration_known_share: number;
}): string {
  return `${tracksLabel(item.track_count)} · ${durationLabel(item.duration_seconds, item.duration_known_share)}`;
}

/** "DRAFT SET · VENUE", or "DRAFT SET" with no venue. */
export function draftKicker(locationName: string | null): string {
  const venue = locationName?.trim();
  return venue ? `DRAFT SET · ${venue.toUpperCase()}` : "DRAFT SET";
}

/** "CREATED TODAY" / "CREATED YESTERDAY" / "CREATED N DAYS AGO", then "CREATED OCT 3" (with the year when it differs). */
export function createdLabel(createdAt: string, timeZone: string, now: Date = new Date()): string {
  const days = daysSince(createdAt, timeZone, now);
  if (days === 0) return "CREATED TODAY";
  if (days === 1) return "CREATED YESTERDAY";
  if (days < RELATIVE_DAYS) return `CREATED ${days} DAYS AGO`;
  const created = new Date(createdAt);
  const year = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date);
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(year(created) === year(now) ? {} : { year: "numeric" }),
  }).format(created);
  return `CREATED ${date.toUpperCase()}`;
}

export const ALL_PLAYLISTS_HREF = "/playlists";

/** Playlists are built from the Tracks page. */
export const CREATE_PLAYLIST_HREF = "/tracks";

/** A playlist, or the playlist a live set belongs to (its set panel lives there). */
export function playlistHref(playlistId: number): string {
  return `/playlists/${playlistId}`;
}
