import type { GenreTreeNode } from "@/api-contract/schemas";
import { normalizeGenreName } from "@/lib/genres/normalization";
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
