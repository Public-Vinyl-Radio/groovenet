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

/**
 * Attribute filters on `/api/tracks/search` (#412), applied in SQL in every
 * mode: in the lexical `WHERE` and inside the context vector scan.
 */
export type TrackAttributeFilters = {
  bpmMin?: number;
  bpmMax?: number;
  /** Exact, case-insensitive: `A minor` matches `a minor`, not `Am`. */
  key?: string;
  /** At least this many stars. */
  minStarRating?: number;
  /** Any of these genres or their subgenres (#375). */
  genreFilter?: GenreFilter;
};

/** Clauses for the set filters, binding each value through `bind` (which returns its `$n`). */
export function attributeFilterClauses(
  filters: TrackAttributeFilters,
  bind: (value: unknown) => string,
  alias = ""
): string[] {
  const col = (column: string) => (alias ? `${alias}.${column}` : column);
  const clauses: string[] = [];
  if (filters.bpmMin !== undefined) clauses.push(`${col("bpm")} >= ${bind(filters.bpmMin)}`);
  if (filters.bpmMax !== undefined) clauses.push(`${col("bpm")} <= ${bind(filters.bpmMax)}`);
  if (filters.key !== undefined) clauses.push(`LOWER(${col("key")}) = LOWER(${bind(filters.key)})`);
  if (filters.minStarRating !== undefined) {
    clauses.push(`${col("star_rating")} >= ${bind(filters.minStarRating)}`);
  }
  if (filters.genreFilter !== undefined) {
    // The genre subqueries correlate with the outer row, so they need its alias.
    if (!alias) throw new Error("A genre filter needs the tracks alias");
    clauses.push(trackGenreFilterClause(filters.genreFilter, bind, alias));
  }
  return clauses;
}

/**
 * A genre filter (#375), already resolved: the requested genres and every
 * genre beneath them, so filtering on `Latin` also finds `Cumbia`.
 */
export type GenreFilter = {
  /** Taxonomy ids, matched against a track's own genre links. */
  ids: string[];
  /** Their normalised names and aliases, matched against raw Discogs values. */
  keys: string[];
};

/** Whether `discogs` (an expression yielding text[]) holds a value spelled like one of `keysRef`. */
function discogsGenreMatchSql(discogs: string, keysRef: string): string {
  return `EXISTS (
    SELECT 1 FROM unnest(${discogs}) AS discogs_genre(name)
    WHERE genre_normalize(discogs_genre.name) = ANY(${keysRef}::text[])
  )`;
}

/**
 * Track match for a genre filter. A track with genres of its own matches only
 * on those; one without falls back to its album's Discogs genres and styles
 * (copied onto the track row), so a reconciled `Cumbia` track on a `Salsa`
 * album is found by `cumbia`, not `salsa`. `alias` is the `tracks` alias.
 */
export function trackGenreFilterClause(
  filter: GenreFilter,
  bind: (value: unknown) => string,
  alias: string
): string {
  const ownGenres = `FROM track_genres tg
      WHERE tg.track_id = ${alias}.track_id AND tg.friend_id = ${alias}.friend_id`;
  return `(
    EXISTS (SELECT 1 ${ownGenres} AND tg.genre_id = ANY(${bind(filter.ids)}::uuid[]))
    OR (
      NOT EXISTS (SELECT 1 ${ownGenres})
      AND ${discogsGenreMatchSql(
        `COALESCE(${alias}.genres, '{}') || COALESCE(${alias}.styles, '{}')`,
        bind(filter.keys)
      )}
    )
  )`;
}

/**
 * The share of an album's genre-tagged tracks that must carry the genre for
 * the album to match on them (#448): one Cumbia track among ten shouldn't
 * make the whole album Cumbia. As a fraction, so the SQL stays in integers.
 */
const ALBUM_TRACK_SHARE = { numerator: 1, denominator: 3 };

/**
 * Album match for a genre filter: the album's own Discogs genres and styles,
 * or at least `ALBUM_TRACK_SHARE` of its live tracks with genre links linked
 * to one of the genres. Tracks with no links don't count either way. `alias`
 * is the `albums` alias.
 */
export function albumGenreFilterClause(
  filter: GenreFilter,
  bind: (value: unknown) => string,
  alias: string
): string {
  const discogs = discogsGenreMatchSql(
    `COALESCE(${alias}.genres, '{}') || COALESCE(${alias}.styles, '{}')`,
    bind(filter.keys)
  );
  // DISTINCT: a track linked to two of the genres still counts once.
  const matching = `count(DISTINCT gt.track_id) FILTER (WHERE tg.genre_id = ANY(${bind(filter.ids)}::uuid[]))`;
  const tagged = "count(DISTINCT gt.track_id)";
  return `(
    ${discogs}
    OR EXISTS (
      SELECT 1
      FROM tracks gt
      JOIN track_genres tg ON tg.track_id = gt.track_id AND tg.friend_id = gt.friend_id
      WHERE gt.release_id = ${alias}.release_id
        AND gt.friend_id = ${alias}.friend_id
        AND gt.deleted_at IS NULL
      HAVING ${matching} > 0
        AND ${matching} * ${ALBUM_TRACK_SHARE.denominator} >= ${tagged} * ${ALBUM_TRACK_SHARE.numerator}
    )
  )`;
}
