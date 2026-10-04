/**
 * The `filter` string `/api/tracks/search` accepts, parsed into what it
 * actually means: an optional friend and a list of "missing X" checks. Both
 * the lexical query and the vector scan (#409) build their SQL from this, so
 * the filter chips mean the same thing in every search mode.
 */

export type TrackMissingFilter =
  | "local_audio"
  | "bpm_or_key"
  | "all_streaming_urls"
  | "apple_music_url"
  | "youtube_url"
  | "soundcloud_url";

export type TrackFilterSpec = {
  friendId?: number;
  missing: TrackMissingFilter[];
};

const ALL_STREAMING_URLS =
  "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)";

/** Recognised substrings, in the order their clauses are emitted. */
const MISSING_MARKERS: [TrackMissingFilter, string][] = [
  ["local_audio", "local_audio_url IS NULL"],
  ["bpm_or_key", "(bpm IS NULL OR key IS NULL)"],
  ["all_streaming_urls", ALL_STREAMING_URLS],
  ["apple_music_url", "apple_music_url IS NULL"],
  ["youtube_url", "youtube_url IS NULL"],
  ["soundcloud_url", "soundcloud_url IS NULL"],
];

export function parseTrackFilterSpec(filter: string | undefined): TrackFilterSpec {
  if (!filter) return { missing: [] };
  const friendIdMatch = filter.match(/friend_id\s*=\s*(\d+)/i);
  return {
    ...(friendIdMatch ? { friendId: Number(friendIdMatch[1]) } : {}),
    missing: MISSING_MARKERS.filter(([, marker]) => filter.includes(marker)).map(
      ([name]) => name
    ),
  };
}

/** The SQL for one check, with columns qualified by `alias` when given. */
export function missingFilterClause(name: TrackMissingFilter, alias = ""): string {
  const col = (column: string) => (alias ? `${alias}.${column}` : column);
  switch (name) {
    case "local_audio":
      return `${col("local_audio_url")} IS NULL`;
    case "bpm_or_key":
      return `(${col("bpm")} IS NULL OR ${col("key")} IS NULL)`;
    case "all_streaming_urls":
      return `(${col("apple_music_url")} IS NULL AND ${col("youtube_url")} IS NULL AND ${col("soundcloud_url")} IS NULL)`;
    default:
      return `${col(name)} IS NULL`;
  }
}
