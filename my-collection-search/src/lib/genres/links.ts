import type { GenreTreeNode } from "@/api-contract/schemas";
import { normalizeGenreName } from "@/lib/genres/normalization";
import type { GenreOption } from "@/lib/genres/options";
import { dedupeDisplayTags, explodeDisplayTags } from "@/lib/trackUtils";

/** Normalised taxonomy name or alias → genre slug. */
export type GenreLookup = ReadonlyMap<string, string>;

/** A genre badge as rendered: its text, and the slug it links to, if any. */
export type GenreBadgeItem = { label: string; slug: string | null };

/** Which search a badge opens: track search lives at `/`, album search at `/albums`. */
export type GenreSearchScope = "tracks" | "albums";

/**
 * Every taxonomy name and alias, keyed the way the genre filter (#375)
 * matches them, so a raw Discogs value resolves to exactly the genre that
 * filtering by it would use.
 */
export function buildGenreLookup(nodes: GenreTreeNode[]): GenreLookup {
  const all: GenreTreeNode[] = [];
  const collect = (list: GenreTreeNode[]): void =>
    list.forEach((node) => {
      all.push(node);
      collect(node.children);
    });
  collect(nodes);

  const lookup = new Map<string, string>();
  for (const node of all) lookup.set(normalizeGenreName(node.name), node.slug);
  // Aliases second, so a canonical name always wins over another genre's alias.
  for (const node of all) {
    for (const alias of node.aliases ?? []) {
      if (!lookup.has(alias)) lookup.set(alias, node.slug);
    }
  }
  return lookup;
}

export function genreSearchHref(slug: string, scope: GenreSearchScope): string {
  const query = `genre=${encodeURIComponent(slug)}`;
  return scope === "albums" ? `/albums?${query}` : `/?${query}`;
}

/** Name/alias keys, with spaces and hyphens dropped, so "post punk", "post-punk"
 * and "postpunk" all condense to the same comparison key. */
const condenseGenreKey = (value: string): string =>
  normalizeGenreName(value).replace(/[\s-]+/g, "");

/**
 * Genres to offer the command palette (#472) for what has been typed: a
 * prefix or substring match on the taxonomy's own name/alias lookup, so
 * aliases and hyphen/space variants resolve the same way they do everywhere
 * else. Genres with no tracks are left out unless nothing else matches.
 */
export function matchGenresForPalette(
  lookup: GenreLookup,
  options: readonly GenreOption[],
  query: string,
  limit = 5
): GenreOption[] {
  const q = condenseGenreKey(query);
  if (!q) return [];

  const bySlug = new Map(options.map((option) => [option.slug, option]));
  const bestRank = new Map<string, number>();
  for (const [key, slug] of lookup) {
    const condensed = condenseGenreKey(key);
    let rank: number;
    if (condensed.startsWith(q)) rank = 0;
    else if (condensed.includes(q)) rank = 1;
    else continue;
    const current = bestRank.get(slug);
    if (current === undefined || rank < current) bestRank.set(slug, rank);
  }

  const matches = Array.from(bestRank.entries()).flatMap(([slug, rank]) => {
    const option = bySlug.get(slug);
    return option ? [{ option, rank }] : [];
  });

  const withTracks = matches.filter(({ option }) => option.track_count > 0);
  const pool = withTracks.length > 0 ? withTracks : matches;

  return pool
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.option.track_count - a.option.track_count ||
        a.option.name.localeCompare(b.option.name)
    )
    .slice(0, limit)
    .map(({ option }) => option);
}

/** Discogs genres or styles, each linked when the taxonomy knows its spelling. */
export function discogsGenreBadges(values: unknown, lookup: GenreLookup): GenreBadgeItem[] {
  return dedupeDisplayTags(values).map((label) => ({
    label,
    slug: lookup.get(normalizeGenreName(label)) ?? null,
  }));
}

/**
 * The DJ-facing genres to badge on a track: its taxonomy genres (#371) once
 * it has any, otherwise its free-text `local_tags` until reconciliation maps
 * them. Never both: a reconciled track's raw tags are its history. A raw tag
 * links only when it is already a taxonomy name or alias.
 */
export function trackGenreBadges(
  track: { track_genres?: { name: string; slug: string }[]; local_tags?: unknown },
  lookup: GenreLookup
): GenreBadgeItem[] {
  if (track.track_genres && track.track_genres.length > 0) {
    const seen = new Set<string>();
    return track.track_genres.flatMap((genre) => {
      if (seen.has(genre.slug)) return [];
      seen.add(genre.slug);
      return [{ label: genre.name, slug: genre.slug }];
    });
  }
  return explodeDisplayTags(track.local_tags).map((label) => ({
    label,
    slug: lookup.get(normalizeGenreName(label)) ?? null,
  }));
}
