/**
 * Recommendation pre-scorer: the genre-overlap, Camelot and era calculations
 * the ranker's signals and constraints reuse (#1191). Its blend / mixable /
 * strict modes are ranking configs now (`src/lib/ranking/configs.ts`), scored
 * by the one ranker (`src/lib/ranking/ranker.ts`).
 */

import type { GenreRef } from "./recommendation-candidate-retriever";
import { camelotOf } from "./mixCompat";
import { DEFAULT_GENRE_SIMILARITY_WEIGHTS } from "./genres/genreSimilarity";

/**
 * Parse Camelot code to position on wheel (1-12) and type (A/B)
 */
function parseCamelotCode(camelot: string): { position: number; type: string } | null {
  if (!camelot) return null;

  const match = camelot.match(/^(\d+)([AB])$/);
  if (!match) return null;

  return {
    position: parseInt(match[1], 10),
    type: match[2],
  };
}

/**
 * Calculate Camelot distance (wheel positions + type difference)
 * Returns null if either key is unrecognised or missing; the key rule treats
 * that as a pass, as the `wheel` metric does.
 *
 * Distance logic:
 * - Same code: distance = 0
 * - Same position, different type (relative major/minor): distance = 0.5
 * - Adjacent positions, same type: distance = 1
 * - Adjacent positions, different type: distance = 1.5
 * - etc.
 */
export function calculateCamelotDistance(key1: string | null, key2: string | null): number | null {
  if (!key1 || !key2) return null;

  // `camelotOf` reads stored spellings (`C major`, `F# minor`, `Db major`) in
  // any case, with enharmonics; an unrecognised key is null (#1211).
  const camelot1 = camelotOf(key1);
  const camelot2 = camelotOf(key2);

  if (!camelot1 || !camelot2) return null;

  const parsed1 = parseCamelotCode(camelot1);
  const parsed2 = parseCamelotCode(camelot2);

  if (!parsed1 || !parsed2) return null;

  // Same camelot code
  if (camelot1 === camelot2) return 0;

  // Relative major/minor (same position, different type)
  if (parsed1.position === parsed2.position) {
    return 0.5;
  }

  // Calculate wheel distance (circular, so min of forward/backward)
  const forward = (parsed2.position - parsed1.position + 12) % 12;
  const backward = (parsed1.position - parsed2.position + 12) % 12;
  const wheelDistance = Math.min(forward, backward);

  // Type penalty (0 if same, 0.5 if different)
  const typePenalty = parsed1.type === parsed2.type ? 0 : 0.5;

  return wheelDistance + typePenalty;
}

// ─── Genre overlap weights (#487) ─────────────────────────────────────────────

/** Weight of the genre_overlap signal in the pre-scorer modes (a full overlap adds 0.08). */
export const TAG_BONUS_WEIGHT = 0.08;

/**
 * Strict mode rejects a candidate whose soft genre overlap is below this.
 * Small on purpose: it only drops candidates with nothing or next to nothing
 * in common with the seed (one weak co-occurrence link among several genres),
 * never one sharing a genre, an ancestor/descendant or a sibling.
 */
export const MIN_GENRE_OVERLAP = 0.05;

/**
 * Most credit a merely *related* genre (a `genre_similarity` row) can earn,
 * so it always ranks below the same genre or an ancestor/descendant (1.0).
 */
export const RELATED_GENRE_MAX_CREDIT = 0.8;

/**
 * Highest score `computeGenreSimilarity` can store under its default weights
 * (a sibling at full NPMI), used to map a stored score into [0, 1] before
 * applying `RELATED_GENRE_MAX_CREDIT`. A taxonomy-only sibling (score 1)
 * therefore earns 0.4, and a pure co-occurrence pair earns 0.4 * NPMI.
 */
export const GENRE_SIMILARITY_MAX_SCORE =
  DEFAULT_GENRE_SIMILARITY_WEIGHTS.taxonomyWeight *
    DEFAULT_GENRE_SIMILARITY_WEIGHTS.taxonomySiblingBase +
  DEFAULT_GENRE_SIMILARITY_WEIGHTS.coOccurrenceWeight;

/**
 * What the soft overlap needs beyond the two tracks' own genres: the
 * `genre_similarity` table and the full taxonomy (for ancestors beyond the
 * immediate parent). Load it once per recommendation request with
 * `loadGenreOverlapContext` and pass it to every candidate — never a query
 * per candidate.
 */
export interface GenreOverlapContext {
  /** Related-genre score keyed by `similarityKey(a, b)`, the higher of both directions. */
  similarity: Map<string, number>;
  /** Every genre's parent id, for walking the ancestor chain. */
  parentOf: Map<string, string | null>;
}

export const EMPTY_GENRE_OVERLAP_CONTEXT: GenreOverlapContext = {
  similarity: new Map(),
  parentOf: new Map(),
};

function similarityKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Builds the in-memory context from the raw `genre_similarity` rows and the taxonomy. */
export function buildGenreOverlapContext(
  pairs: Array<{ genreId: string; relatedGenreId: string; score: number }>,
  taxonomy: Array<{ id: string; parentId: string | null }>,
): GenreOverlapContext {
  const similarity = new Map<string, number>();
  for (const pair of pairs) {
    if (pair.genreId === pair.relatedGenreId) continue;
    const key = similarityKey(pair.genreId, pair.relatedGenreId);
    // Top-N truncation can keep a pair on one side only, or with the same
    // score twice; either direction counts.
    similarity.set(key, Math.max(similarity.get(key) ?? 0, pair.score));
  }
  return { similarity, parentOf: new Map(taxonomy.map((g) => [g.id, g.parentId])) };
}

function hasAncestor(
  id: string,
  ancestorId: string,
  parentOf: Map<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let parentId = parentOf.get(id) ?? null;
  // The taxonomy forbids cycles; `seen` is a defensive bound, not a fix.
  while (parentId && !seen.has(parentId)) {
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    parentId = parentOf.get(parentId) ?? null;
  }
  return false;
}

/**
 * How well genre `a` is matched by genre `b`: 1 for the same genre or an
 * ancestor/descendant, a scaled `genre_similarity` score for a related one,
 * otherwise 0.
 */
function genreMatch(
  a: string,
  b: string,
  context: GenreOverlapContext,
  parentOf: Map<string, string | null>,
): number {
  if (a === b || hasAncestor(a, b, parentOf) || hasAncestor(b, a, parentOf)) return 1;
  const score = context.similarity.get(similarityKey(a, b));
  if (!score || score <= 0) return 0;
  return RELATED_GENRE_MAX_CREDIT * Math.min(1, score / GENRE_SIMILARITY_MAX_SCORE);
}

function meanBestMatch(
  from: string[],
  to: string[],
  context: GenreOverlapContext,
  parentOf: Map<string, string | null>,
): number {
  let total = 0;
  for (const a of from) {
    let best = 0;
    for (const b of to) {
      best = Math.max(best, genreMatch(a, b, context, parentOf));
      if (best === 1) break;
    }
    total += best;
  }
  return total / from.length;
}

/**
 * Soft overlap of two tracks' taxonomy genres, in [0, 1] (#487). For each
 * seed genre, the best match among the candidate's genres (see
 * `genreMatch`), averaged; the same from the candidate's side; then the mean
 * of both directions — so a candidate carrying many extra genres the seed
 * lacks, or the reverse, scores below a full match.
 *
 * Without a context (no similarity table loaded) only exact and
 * parent/child matches count, using each ref's own `parentId`.
 */
export function calculateGenreOverlap(
  seedGenres: GenreRef[],
  candidateGenres: GenreRef[],
  context: GenreOverlapContext = EMPTY_GENRE_OVERLAP_CONTEXT,
): number {
  if (seedGenres.length === 0 || candidateGenres.length === 0) return 0;

  // The refs' own parent ids cover genres the loaded taxonomy doesn't know yet.
  const parentOf = new Map(context.parentOf);
  for (const genre of [...seedGenres, ...candidateGenres]) {
    if (!parentOf.has(genre.id)) parentOf.set(genre.id, genre.parentId);
  }

  const seedIds = [...new Set(seedGenres.map((g) => g.id))];
  const candidateIds = [...new Set(candidateGenres.map((g) => g.id))];
  const forward = meanBestMatch(seedIds, candidateIds, context, parentOf);
  const backward = meanBestMatch(candidateIds, seedIds, context, parentOf);
  return (forward + backward) / 2;
}

/**
 * Define era ordering for adjacency
 */
const ERA_ORDER = [
  "pre-1950s",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
];

/**
 * Check if two eras are adjacent
 */
export function areErasAdjacent(era1: string | null, era2: string | null): boolean {
  if (!era1 || !era2) return false;

  const idx1 = ERA_ORDER.indexOf(era1);
  const idx2 = ERA_ORDER.indexOf(era2);

  if (idx1 === -1 || idx2 === -1) return false;

  return Math.abs(idx1 - idx2) === 1;
}
