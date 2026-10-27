// Utility functions for track duration parsing and formatting

export { formatSeconds, getTrackDurationSeconds, parseDurationToSeconds } from "@groovenet/client/player-session";

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
