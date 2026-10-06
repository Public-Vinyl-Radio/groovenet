import type { GenreFilter } from "@/lib/trackFilterSpec";
import { genreRepository } from "@/server/repositories/genreRepository";
import { trackGenreRepository } from "@/server/repositories/trackGenreRepository";

export type GenreFilterResolution =
  | { filter: GenreFilter | undefined; unknown?: undefined }
  | { filter?: undefined; unknown: string[] };

/**
 * Resolves the `genre` search parameter (#375) — slugs, ids or names, a name
 * going through the aliases — into a filter covering each genre and its
 * subgenres. Anything that matches no genre is returned as `unknown`, for the
 * caller to reject: a typo should fail loudly, not silently match nothing.
 */
export async function resolveGenreFilter(refs: string[]): Promise<GenreFilterResolution> {
  const values = refs.map((ref) => ref.trim()).filter(Boolean);
  if (values.length === 0) return { filter: undefined };

  const bySlug = await genreRepository.findIdsBySlug(values.map((v) => v.toLowerCase()));
  const rest = values.filter((value) => !bySlug.has(value.toLowerCase()));
  const { ids, unknown } = await trackGenreRepository.resolveGenreRefs(rest);
  if (unknown.length > 0) return { unknown };

  const seeds = [...new Set([...bySlug.values(), ...ids])];
  return { filter: await genreRepository.expandToFilter(seeds) };
}

/** The 400 body for genres that resolved to nothing. */
export function unknownGenresError(unknown: string[]) {
  return { error: `Unknown genre: ${unknown.join(", ")}`, unknown };
}
