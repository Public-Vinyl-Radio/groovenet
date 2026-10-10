import type { GenrePageRef } from "@/api-contract/schemas";
import { byCount } from "@/lib/genres/genrePageRefs";
import { computeGenreSimilarity, DEFAULT_TOP_N, type GenreSimilaritySignals } from "@/lib/genres/genreSimilarity";
import { genreRepository, type GenreRow } from "@/server/repositories/genreRepository";
import { genreSimilarityRepository } from "@/server/repositories/genreSimilarityRepository";

export const RELATED_LIMIT = DEFAULT_TOP_N;

export type GenreRelatedRef = GenrePageRef & { score?: number; signals?: GenreSimilaritySignals };

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** "About 3 albums" from the design (#377), overridable since co-occurrence noise depends on collection size. */
export function minSupportAlbums(): number {
  return positiveInt(process.env.GENRE_SIMILARITY_MIN_SUPPORT_ALBUMS, 3);
}

/** Siblings under the genre's parent that the collection uses, until the table has rows for it (#377). */
function siblingFallback(flat: GenreRow[], genre: GenreRow, totals: Map<string, number>, limit: number): GenreRelatedRef[] {
  const toRef = (row: GenreRow): GenrePageRef => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    track_count: totals.get(row.id) ?? 0,
  });
  return flat
    .filter((row) => row.parent_id === genre.parent_id && row.id !== genre.id)
    .map(toRef)
    .filter((row) => row.track_count > 0)
    .sort(byCount)
    .slice(0, limit);
}

/**
 * A genre's related genres (#377): the stored, explainable ranking when the
 * table has rows for it, else the taxonomy-sibling stand-in it replaces.
 */
export async function resolveRelated(
  flat: GenreRow[],
  genre: GenreRow,
  totals: Map<string, number>,
  limit: number = RELATED_LIMIT
): Promise<GenreRelatedRef[]> {
  const stored = await genreSimilarityRepository.topForGenre(genre.id, limit);
  if (stored.length === 0) return siblingFallback(flat, genre, totals, limit);

  const byId = new Map(flat.map((row) => [row.id, row]));
  const related: GenreRelatedRef[] = [];
  for (const row of stored) {
    const match = byId.get(row.related_genre_id);
    if (!match) continue; // Deleted since the table was last recomputed.
    related.push({
      id: match.id,
      name: match.name,
      slug: match.slug,
      track_count: totals.get(match.id) ?? 0,
      score: row.score,
      signals: row.signals,
    });
  }
  return related;
}

/** `GET /api/genres/{slug}/similar` (#377): computed over every collection, not scoped to one friend. */
export async function getGenreSimilarPage(
  ref: string
): Promise<{ genre: GenrePageRef; related: GenreRelatedRef[] } | null> {
  const flat = await genreRepository.listFlat();
  const key = ref.trim().toLowerCase();
  const genre = flat.find((row) => row.slug === key || row.id === key);
  if (!genre) return null;

  const facets = await genreRepository.trackFacets([], []);
  const totals = new Map(facets.map((facet) => [facet.id, facet.track_count]));
  const related = await resolveRelated(flat, genre, totals, RELATED_LIMIT);
  return {
    genre: { id: genre.id, name: genre.name, slug: genre.slug, track_count: totals.get(genre.id) ?? 0 },
    related,
  };
}

/**
 * Recomputes the whole `genre_similarity` table in one transaction (#377).
 * Idempotent: the same taxonomy and collection produce the same rows, so a
 * second run with nothing changed writes back what was already there.
 */
export async function recomputeGenreSimilarity(): Promise<{ genres: number; rows: number }> {
  const flat = await genreRepository.listFlat();
  const { pairs, albumCounts, totalAlbums } = await genreSimilarityRepository.loadCoOccurrence();

  const entries = computeGenreSimilarity(
    flat.map((row) => ({ id: row.id, parentId: row.parent_id })),
    pairs.map((pair) => ({ genreIdA: pair.genre_id_a, genreIdB: pair.genre_id_b, sharedAlbums: pair.shared_albums })),
    new Map(albumCounts.map((row) => [row.genre_id, row.album_count])),
    totalAlbums,
    { minSupportAlbums: minSupportAlbums(), topN: RELATED_LIMIT }
  );

  await genreSimilarityRepository.replaceAll(entries);
  return { genres: flat.length, rows: entries.length };
}

/** Fire-and-forget: a mutation that changes the taxonomy or the collection's genre links triggers this, never awaits it. */
export function triggerGenreSimilarityRefresh(): void {
  void recomputeGenreSimilarity().catch((error) => {
    console.error("[genre-similarity] refresh failed:", error);
  });
}

// ─── Nightly refresh (#377) ──────────────────────────────────────────────────

const GLOBAL_REFRESH_KEY = "__groovenetGenreSimilarityRefreshStarted";
type GlobalWithRefresh = typeof globalThis & { [GLOBAL_REFRESH_KEY]?: boolean };

export function refreshIntervalMinutes(): number {
  return positiveInt(process.env.GENRE_SIMILARITY_REFRESH_INTERVAL_MINUTES, 24 * 60);
}

let lastRefreshAtMs = 0;

/** One scheduler tick: recompute if the interval has elapsed. Exported for the nightly timer and its test. */
export async function refreshTick(now: number = Date.now()): Promise<void> {
  if (now - lastRefreshAtMs < refreshIntervalMinutes() * 60_000) return;
  lastRefreshAtMs = now;

  try {
    const result = await recomputeGenreSimilarity();
    console.log(`[genre-similarity] recomputed ${result.rows} row(s) across ${result.genres} genre(s)`);
  } catch (error) {
    console.error("[genre-similarity] refresh tick failed:", error);
  }
}

/** Exported for tests: the tick's interval bookkeeping is module state. */
export function resetGenreSimilarityRefreshClock(): void {
  lastRefreshAtMs = 0;
}

/** Start the nightly refresh scheduler, once per process. */
export function startGenreSimilarityRefresh(): void {
  const g = globalThis as GlobalWithRefresh;
  if (g[GLOBAL_REFRESH_KEY]) return;
  g[GLOBAL_REFRESH_KEY] = true;

  void refreshTick();
  setInterval(() => void refreshTick(), 60_000);

  console.log("[genre-similarity] started");
}
