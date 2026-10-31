// Wording for Home's New arrivals (#882), kept pure so it can be tested on its own.

const STAR_COUNT = 5;

/** "NOT PLAYED" / "1 PLAY" / "N PLAYS". */
export function playsLabel(playCount: number): string {
  if (playCount <= 0) return "NOT PLAYED";
  return playCount === 1 ? "1 PLAY" : `${playCount.toLocaleString("en-US")} PLAYS`;
}

export type RatingChip = {
  /** "★★★★☆", or "UNRATED". */
  label: string;
  rated: boolean;
  /** Text for assistive tech; only needed when the label is stars. */
  description: string;
};

/** The chip for `album_rating` (1–5 stars). Null, and the column's default 0, are unrated. */
export function ratingChip(rating: number | null): RatingChip {
  if (rating === null || rating < 1) {
    return { label: "UNRATED", rated: false, description: "Unrated" };
  }
  const stars = Math.min(Math.round(rating), STAR_COUNT);
  return {
    label: "★".repeat(stars) + "☆".repeat(STAR_COUNT - stars),
    rated: true,
    description: `Rated ${stars} of ${STAR_COUNT}`,
  };
}

/** "YYYY-MM-DD" for `date` in `timeZone`, as a UTC day number. */
function calendarDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000);
}

/** Whole calendar days from `dateAdded` to `now` in `timeZone`; never negative. */
export function daysSince(dateAdded: string, timeZone: string, now: Date = new Date()): number {
  return Math.max(0, calendarDay(now, timeZone) - calendarDay(new Date(dateAdded), timeZone));
}

/** "ADDED TODAY" / "ADDED YESTERDAY" / "ADDED N DAYS AGO". */
export function addedLabel(dateAdded: string, timeZone: string, now: Date = new Date()): string {
  const days = daysSince(dateAdded, timeZone, now);
  if (days === 0) return "ADDED TODAY";
  return days === 1 ? "ADDED YESTERDAY" : `ADDED ${days} DAYS AGO`;
}

/** The header caption: "last 30 days · least played first · 3 unrated" (desktop), upper-case and short on phones. */
export function arrivalsCaption(
  unratedCount: number,
  windowDays: number,
  variant: "desktop" | "phone",
): string {
  if (variant === "phone") {
    return unratedCount > 0 ? `LEAST PLAYED · ${unratedCount} UNRATED` : "LEAST PLAYED";
  }
  const parts = [`last ${windowDays} days`, "least played first"];
  if (unratedCount > 0) parts.push(`${unratedCount} unrated`);
  return parts.join(" · ");
}

export const ALL_ARRIVALS_HREF = "/albums?sort=date_added:desc";

/** The album page, for the friend whose collection Home shows. */
export function arrivalHref(releaseId: string, friendId: number): string {
  return `/albums/${encodeURIComponent(releaseId)}?friend_id=${friendId}`;
}
