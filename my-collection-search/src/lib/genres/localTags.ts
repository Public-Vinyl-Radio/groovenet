import { normalizeGenreName } from "./normalization";

/**
 * Separators that join several tags inside one `local_tags` string, e.g.
 * `psychedelic soul · desert psych · cinematic instrumental`.
 *
 * `/` is deliberately absent: `Funk / Soul` is one Discogs genre, and splitting
 * on it is the bug in #369.
 */
const LOCAL_TAG_SEPARATORS = /[,·•]/;

/**
 * A Postgres array literal stored as text: `{}`, `{Cumbia,Salsa}`,
 * `{"Funk / Soul"}`. The Discogs import writes `local_tags: []` into the text
 * column, which Postgres stores as `{}` — 174 of friend 6's tracks in prod.
 */
const ARRAY_LITERAL = /^\s*\{(.*)\}\s*$/s;

/** Breaks one `local_tags` string into its raw values, trimmed, blanks dropped. */
export function splitLocalTags(localTags: string | null | undefined): string[] {
  if (!localTags) return [];
  const literal = ARRAY_LITERAL.exec(localTags);
  const text = literal ? literal[1] : localTags;
  return text
    .split(LOCAL_TAG_SEPARATORS)
    .map((value) => (literal ? value.trim().replace(/^"(.*)"$/s, "$1") : value).trim())
    .filter(Boolean);
}

/** A track's distinct normalised values, in first-seen order. */
export function localTagValues(localTags: string | null | undefined): string[] {
  return [...new Set(splitLocalTags(localTags).map(normalizeGenreName).filter(Boolean))];
}

export type LocalTagTrack = {
  track_id: string;
  friend_id: number;
  local_tags: string | null;
  /** The album's Discogs styles (or genres), used only as AI context. */
  styles?: string[] | null;
};

export type LocalTagValue = {
  value_normalized: string;
  /** Distinct raw spellings seen, at most `maxExamples`, most common first. */
  raw_examples: string[];
  track_count: number;
  /** The most common album styles across the value's tracks. */
  styles: string[];
};

/**
 * Collapses every track's `local_tags` into one entry per normalised value.
 * A track counts once per value even if it repeats it.
 */
export function collectLocalTagValues(
  tracks: LocalTagTrack[],
  { maxExamples = 5, maxStyles = 5 } = {}
): LocalTagValue[] {
  const byValue = new Map<
    string,
    { tracks: number; raw: Map<string, number>; styles: Map<string, number> }
  >();

  for (const track of tracks) {
    const seen = new Set<string>();
    for (const raw of splitLocalTags(track.local_tags)) {
      const key = normalizeGenreName(raw);
      let entry = byValue.get(key);
      if (!entry) {
        entry = { tracks: 0, raw: new Map(), styles: new Map() };
        byValue.set(key, entry);
      }
      entry.raw.set(raw, (entry.raw.get(raw) ?? 0) + 1);
      if (seen.has(key)) continue;
      seen.add(key);
      entry.tracks += 1;
      for (const style of track.styles ?? []) {
        entry.styles.set(style, (entry.styles.get(style) ?? 0) + 1);
      }
    }
  }

  const top = (counts: Map<string, number>, limit: number) =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value]) => value);

  return [...byValue.entries()]
    .map(([value_normalized, entry]) => ({
      value_normalized,
      raw_examples: top(entry.raw, maxExamples),
      track_count: entry.tracks,
      styles: top(entry.styles, maxStyles),
    }))
    .sort((a, b) => b.track_count - a.track_count || a.value_normalized.localeCompare(b.value_normalized));
}
