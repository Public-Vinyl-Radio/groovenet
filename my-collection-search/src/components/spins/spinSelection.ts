// The spin detail (#864): which play is selected, where it sits in its
// listening session, and how it came to be logged.
import {
  describeProvenance,
  formatClockTime,
  formatTimeRange,
  formatTrackLine,
  type ListeningLogDay,
  type ListeningSession,
  type SpinPlay,
} from "./spinSummary";

/** The `?spin=` search param that holds the selected play's key. */
export const SPIN_PARAM = "spin";

export type SpinSelection = {
  play: SpinPlay;
  session: ListeningSession;
  /** The play's index in `session.plays`, which are newest first. */
  index: number;
};

/** The play with `key` among the loaded days, or null when it isn't loaded. */
export function findSpinSelection(
  days: ListeningLogDay[],
  key: string | null,
): SpinSelection | null {
  if (!key) return null;
  for (const day of days) {
    for (const session of day.sessions) {
      const index = session.plays.findIndex((play) => play.key === key);
      if (index >= 0) return { play: session.plays[index], session, index };
    }
  }
  return null;
}

export type SpinNeighbours = {
  /** The play just before this one, or null for the session's first. */
  before: SpinPlay | null;
  /** The play just after this one, or null for the session's last. */
  after: SpinPlay | null;
};

export function spinNeighbours({ session, index }: SpinSelection): SpinNeighbours {
  return {
    before: session.plays[index + 1] ?? null,
    after: session.plays[index - 1] ?? null,
  };
}

/** "Spin 3 of 6 · 7:16 PM–7:38 PM", counting from the session's first play. */
export function describeSessionPosition({ session, index }: SpinSelection, timeZone: string) {
  const total = session.plays.length;
  return `Spin ${total - index} of ${total} · ${formatTimeRange(session.start, session.end, timeZone)}`;
}

/** "7:34 PM · A2 · Desire Be Desire Go". */
export function describeNeighbour(play: SpinPlay, timeZone: string): string {
  return `${formatClockTime(play.playedAt, timeZone)} · ${formatTrackLine(play)}`;
}

export type SpinLogging = {
  source: "Vinyl" | "Digital";
  loggedBy: string;
  /** A line under the facts, or null when they say it all. */
  note: string | null;
};

export function describeSpinLogging(play: SpinPlay): SpinLogging {
  const session = play.item.session;
  if (play.medium === "digital") {
    return { source: "Digital", loggedBy: "Player", note: null };
  }
  if (session.provenance === "playlist") {
    return { source: "Vinyl", loggedBy: "Playlist", note: "Logged when a playlist was played." };
  }
  const provenance = describeProvenance(play.item);
  if (!provenance.automatic) {
    return { source: "Vinyl", loggedBy: "Manual entry", note: "Logged by hand." };
  }
  return session.corrected_at
    ? {
        source: "Vinyl",
        loggedBy: "Auto-detected",
        note: "Picked up from the turntable automatically, then corrected by hand.",
      }
    : {
        source: "Vinyl",
        loggedBy: "Auto-detected",
        note: "Picked up from the turntable automatically. Wrong track or side? Fix it below.",
      };
}

function sameYear(date: Date, now: Date, timeZone: string): boolean {
  const year = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(d);
  return year(date) === year(now);
}

/** "Tue Oct 27", with the year when it isn't this year's. */
export function formatSpinDate(dateString: string, timeZone: string, now: Date = new Date()) {
  const date = new Date(dateString);
  return date
    .toLocaleDateString("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      ...(sameYear(date, now, timeZone) ? {} : { year: "numeric" }),
    })
    .replace(/,/g, "");
}

/** "Tue Oct 27 · 7:38 PM". */
export function formatLoggedAt(dateString: string, timeZone: string, now: Date = new Date()) {
  return `${formatSpinDate(dateString, timeZone, now)} · ${formatClockTime(dateString, timeZone)}`;
}

/** "LP-342 · SIDE A1", "A1", or null when there is neither. */
export function describeSpinHeadline(
  play: SpinPlay,
  libraryIdentifier: string | null | undefined,
): string | null {
  const position = play.position
    ? play.medium === "vinyl"
      ? `SIDE ${play.position}`
      : play.position
    : null;
  const parts = [libraryIdentifier, position].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "4× PLAYED · LAST OCT 27". */
export function describeTrackPlays(
  stats: { play_count: number; last_played_at: string | null },
  timeZone: string,
  now: Date = new Date(),
): string {
  const count = `${stats.play_count}× PLAYED`;
  if (!stats.last_played_at) return count;
  // The weekday reads oddly here; the date alone says when.
  const date = formatSpinDate(stats.last_played_at, timeZone, now).replace(/^\w+ /, "");
  return `${count} · LAST ${date.toUpperCase()}`;
}
