/**
 * Example values keyed by property name, for OpenAPI responses that have no
 * hand-written example.
 *
 * A schema that says only `{ type: "string" }` gives a generator nothing to
 * work with, so it emits "string" — which is what made most of the spec's
 * sample bodies unreadable. But the API reuses a small vocabulary: `message`
 * and `error` alone account for nearly half of those properties, and the rest
 * is mostly track/album/job fields that repeat across endpoints.
 *
 * Naming the vocabulary once here fixes every endpoint at the same time, and
 * keeps the examples consistent between them — the same `track_id` appears
 * everywhere rather than a different invented value per route.
 *
 * A schema that states its own `example`, `enum`, `const`, `default` or
 * `format` always wins over this; see exampleFromSchema.
 */

type Primitive = string | number | boolean;

/** Matched against the property name normalised to lower snake_case. */
const BY_NAME: Record<string, Primitive> = {
  // Envelope fields — by far the most common.
  message: "Done",
  error: "Track not found",
  reason: "missing_embedding",
  detail: "Track not found",
  status: "ok",
  success: true,

  // Identity.
  id: "1",
  track_id: "trk_001",
  friend_id: 1,
  release_id: "rel_4471",
  playlist_id: 42,
  job_id: "job_8f21c4",
  seed_track_id: "trk_001",
  seed_friend_id: 1,
  username: "dj_nightdriver",
  name: "Warmup Set",

  // Track and album metadata.
  title: "Move Through",
  artist: "Night Driver",
  album: "After Hours",
  year: "1994",
  genre: "Electronic",
  style: "Deep House",
  label: "Warp Records",
  country: "us",
  era: "1990s",
  notes: "Warm pad intro, easy to blend out of.",
  local_tags: "melodic, warm",
  position: "A1",
  duration: "5:30",

  // Audio analysis.
  bpm: 122,
  key: "8A",
  camelot: "8A",
  danceability: 0.62,
  energy: 0.48,

  // Paging and counts.
  limit: 20,
  offset: 0,
  total: 137,
  count: 3,
  page: 1,
  page_size: 50,
  estimated_total_hits: 137,

  // Similarity.
  distance: 0.18,
  sim_identity: 0.82,
  sim_audio: 0.74,

  // Free text.
  prompt: "Describe this track for a DJ set",
  text: "Track: Move Through — Night Driver",
  query: "night driver",
  q: "night driver",
  description: "Generated from the current collection.",
  summary: "Warmup Set",
  template: "{artist} - {title}",
  filter: "bpm > 100",
  sort: "created_at:desc",
  path: "/audio/trk_001.m4a",
  filename: "trk_001.m4a",
  version: "0.1.12",
  schedule_cron: "0 3 * * *",
  max_retries: 3,
  library_identifier: "LIB-0042",
};

/**
 * Matched against the tail of the normalised name when no exact entry exists.
 * Ordered longest-first so `_track_count` does not match `_count` first.
 */
const BY_SUFFIX: Array<[suffix: string, value: Primitive]> = [
  ["_seconds", 213],
  ["_identifier", "LIB-0042"],
  ["_rating", 4],
  ["_count", 3],
  ["_hits", 137],
  ["_format", "m4a"],
  ["_cron", "0 3 * * *"],
  ["_url", "https://example.com/resource"],
  ["_uri", "https://example.com/resource"],
  ["_path", "/audio/trk_001.m4a"],
  ["_name", "Warmup Set"],
  ["_at", "2026-02-17T12:00:00.000Z"],
  ["_on", 1771329600000],
  ["_ms", 1200],
  ["_id", "1"],
  ["_key", "8A"],
];

/** Normalise camelCase, PascalCase and SCREAMING_CASE to lower snake_case. */
function normalise(name: string): string {
  return name
    // camelCase boundary: trackId -> track_Id
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    // acronym boundary: HTTPServer -> HTTP_Server (but not TRACK_ID -> T_R_A_C_K)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/** True when `value` can legally be the example for a schema of this type. */
function matchesType(value: Primitive, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  // An undeclared type constrains nothing, so drop those alongside "null".
  const usable = types.filter((t) => t != null && t !== "null");
  // A schema with no declared type accepts anything.
  if (usable.length === 0) return true;
  return usable.some((t) => {
    if (t === "string") return typeof value === "string";
    if (t === "boolean") return typeof value === "boolean";
    if (t === "integer") return typeof value === "number" && Number.isInteger(value);
    if (t === "number") return typeof value === "number";
    return false;
  });
}

/**
 * An example for a property, or undefined when the name is unknown or the
 * value would not fit the declared type.
 */
export function exampleForProperty(
  propertyName: string | undefined,
  type: unknown
): Primitive | undefined {
  if (!propertyName) return undefined;
  const key = normalise(propertyName);

  const exact = BY_NAME[key];
  if (exact !== undefined && matchesType(exact, type)) return exact;

  for (const [suffix, value] of BY_SUFFIX) {
    if (key.endsWith(suffix) && matchesType(value, type)) return value;
  }

  // An `*_id` that must be a number cannot use the string default above.
  if (key.endsWith("_id") && matchesType(1, type)) return 1;

  return undefined;
}
