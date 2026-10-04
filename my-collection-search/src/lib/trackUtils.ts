// Utility functions for track duration parsing and formatting

export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return 0;
}

export function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  } else {
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}

export function getTrackDurationSeconds(track: { duration_seconds?: number | null; duration?: string | null }): number | null {
  if (typeof track.duration_seconds === "number" && track.duration_seconds > 0) {
    return track.duration_seconds;
  }
  if (track.duration) {
    const parsed = parseDurationToSeconds(track.duration);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function collectDisplayTags(
  values: unknown,
  split: (value: string) => string[]
): string[] {
  const rawValues = Array.isArray(values) ? values : [values];
  const tags: string[] = [];
  const seen = new Set<string>();

  rawValues.forEach((value) => {
    if (typeof value !== "string") return;

    split(value)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && tag !== "{}")
      .forEach((tag) => {
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        tags.push(tag);
      });
  });

  return tags;
}

/**
 * Discogs genres and styles are already single tokens. `Funk / Soul` and
 * `Folk, World, & Country` are one genre each, so they are never split.
 */
export function dedupeDisplayTags(values: unknown): string[] {
  return collectDisplayTags(values, (value) => [value]);
}

/**
 * Free-text `local_tags` can hold several tags in one string. Slashes are not
 * separators: a tag may quote a Discogs name such as `Funk / Soul`.
 */
export function explodeDisplayTags(values: unknown): string[] {
  return collectDisplayTags(values, (value) => value.split(/\s*[,·•]\s*/g));
}
