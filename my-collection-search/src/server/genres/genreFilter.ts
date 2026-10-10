import type { GenreFilter, GenreFilterRef } from "@/lib/trackFilterSpec";
import { genreRepository } from "@/server/repositories/genreRepository";
import { genreSimilarityRepository } from "@/server/repositories/genreSimilarityRepository";
import { trackGenreRepository } from "@/server/repositories/trackGenreRepository";

export type GenreFilterResolution =
  | { filter: GenreFilter | undefined; added: GenreFilterRef[]; unknown?: undefined }
  | { filter?: undefined; added?: undefined; unknown: string[] };

/** "About 5" from #485's design, overridable per request via `similar_limit`. */
export const DEFAULT_SIMILAR_LIMIT = 5;

export type ResolveGenreFilterOptions = {
  /** Widen each seed to its top related genres from `genre_similarity` (#485). */
  includeSimilar?: boolean;
  /** Per-seed cap on related genres pulled in. */
  similarLimit?: number;
  /** Related-genre ids already removed by the caller; never re-added. */
  excludeSimilarIds?: string[];
};

/**
 * Resolves the `genre` search parameter (#375) — slugs, ids or names, a name
 * going through the aliases — into a filter covering each genre and its
 * subgenres. Anything that matches no genre is returned as `unknown`, for the
 * caller to reject: a typo should fail loudly, not silently match nothing.
 *
 * With `includeSimilar` (#485), each seed is first widened to its top related
 * genres from `genre_similarity` — unlike the genre page's `resolveRelated`,
 * this never falls back to taxonomy siblings: a search result should only
 * widen on an explainable, computed relation, not a stand-in that hasn't been
 * scored. `added` names exactly the genres that widening brought in, deduped
 * against the seeds' own subgenres so one already covered isn't listed twice.
 */
export async function resolveGenreFilter(
  refs: string[],
  options: ResolveGenreFilterOptions = {}
): Promise<GenreFilterResolution> {
  const values = refs.map((ref) => ref.trim()).filter(Boolean);
  if (values.length === 0) return { filter: undefined, added: [] };

  const bySlug = await genreRepository.findIdsBySlug(values.map((v) => v.toLowerCase()));
  const rest = values.filter((value) => !bySlug.has(value.toLowerCase()));
  const { ids, unknown } = await trackGenreRepository.resolveGenreRefs(rest);
  if (unknown.length > 0) return { unknown };

  const seeds = [...new Set([...bySlug.values(), ...ids])];
  const baseFilter = await genreRepository.expandToFilter(seeds);

  if (!options.includeSimilar) {
    return { filter: baseFilter, added: [] };
  }

  const limit = options.similarLimit ?? DEFAULT_SIMILAR_LIMIT;
  const excluded = new Set(options.excludeSimilarIds ?? []);
  const alreadyCovered = new Set(baseFilter.ids);

  const relatedBySeed = await Promise.all(
    seeds.map((seed) => genreSimilarityRepository.topForGenre(seed, limit))
  );
  const bestScore = new Map<string, number>();
  for (const related of relatedBySeed) {
    for (const row of related) {
      if (alreadyCovered.has(row.related_genre_id) || excluded.has(row.related_genre_id)) continue;
      const current = bestScore.get(row.related_genre_id);
      if (current === undefined || row.score > current) {
        bestScore.set(row.related_genre_id, row.score);
      }
    }
  }

  if (bestScore.size === 0) {
    return { filter: baseFilter, added: [] };
  }

  const addedIds = [...bestScore.keys()];
  const [filter, addedRefs] = await Promise.all([
    genreRepository.expandToFilter([...seeds, ...addedIds]),
    genreRepository.findRefsByIds(addedIds),
  ]);
  const refById = new Map(addedRefs.map((ref) => [ref.id, ref]));
  const added = addedIds
    .map((id) => refById.get(id))
    .filter((ref): ref is GenreFilterRef => ref !== undefined)
    .sort((a, b) => bestScore.get(b.id)! - bestScore.get(a.id)!);

  return { filter, added };
}

/** The 400 body for genres that resolved to nothing. */
export function unknownGenresError(unknown: string[]) {
  return { error: `Unknown genre: ${unknown.join(", ")}`, unknown };
}
