import type { GenreTreeNode } from "@/api-contract/schemas";
import type { TrackGenre } from "@/types/track";
import { normalizeGenreName } from "@/lib/genres/normalization";

/** A taxonomy genre as the picker offers it: flat, with its parent's name. */
export type GenreOption = TrackGenre & { track_count: number };

/** Depth-first, so each subgenre carries the name of the genre above it. */
export function flattenGenreTree(
  nodes: GenreTreeNode[],
  parent: GenreTreeNode | null = null
): GenreOption[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      name: node.name,
      slug: node.slug,
      parent_id: node.parent_id,
      parent_name: parent?.name ?? null,
      track_count: node.track_count,
    },
    ...flattenGenreTree(node.children, node),
  ]);
}

/**
 * The options to offer for what has been typed, leaving out those already
 * chosen. Matches use the taxonomy's own normalisation, so `post‑punk` finds
 * `Post-Punk`. Names starting with the input rank above names merely
 * containing it, and the genres already used most rank first within each, so
 * an empty input lists the collection's own genres before the long tail.
 */
export function filterGenreOptions(
  options: GenreOption[],
  input: string,
  excludeIds: ReadonlySet<string> = new Set(),
  limit = 50
): GenreOption[] {
  const query = normalizeGenreName(input);
  const rank = (option: GenreOption) => {
    if (!query) return 0;
    const name = normalizeGenreName(option.name);
    if (name.startsWith(query)) return 0;
    if (name.includes(query)) return 1;
    return -1;
  };

  return options
    .filter((option) => !excludeIds.has(option.id))
    .map((option) => ({ option, rank: rank(option) }))
    .filter(({ rank }) => rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.option.track_count - a.option.track_count ||
        a.option.name.localeCompare(b.option.name)
    )
    .slice(0, limit)
    .map(({ option }) => option);
}

/** Whether two genre selections differ as sets, ignoring order. */
export function genreSelectionChanged(before: TrackGenre[], after: TrackGenre[]): boolean {
  if (before.length !== after.length) return true;
  const ids = new Set(before.map((genre) => genre.id));
  return after.some((genre) => !ids.has(genre.id));
}

/**
 * The genres a search filter offers (#375). With counts for the current
 * search, each option carries its count, so ranking puts the biggest first,
 * and genres that would return nothing are left out. Without counts — albums,
 * or a semantic search — every genre is offered as it is.
 */
export function genreFilterOptions(
  options: GenreOption[],
  counts?: ReadonlyMap<string, number>
): GenreOption[] {
  if (!counts) return options;
  return options.flatMap((option) => {
    const count = counts.get(option.id) ?? 0;
    return count > 0 ? [{ ...option, track_count: count }] : [];
  });
}
