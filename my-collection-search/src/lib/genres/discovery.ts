import type { GenreTreeNode } from "@/api-contract/schemas";
import { buildGenreLookup, discogsGenreBadges, countGenreBadges } from "@/lib/genres/links";
import type { CountedGenreNode } from "@/lib/genres/tree";
import type { Album } from "@/types/track";

/** All descendants, largest first, including deeper levels of the taxonomy. */
export function rankedSubgenres(entry: CountedGenreNode): CountedGenreNode[] {
  return entry.children.flatMap((child) => [child, ...rankedSubgenres(child)])
    .sort((a, b) => b.count - a.count || a.node.name.localeCompare(b.node.name));
}

/** Count each arrival once per top-level genre, even when multiple styles match it. */
export function arrivalGenreSummary(albums: Album[], tree: GenreTreeNode[]) {
  const lookup = buildGenreLookup(tree);
  const roots = new Map<string, GenreTreeNode>();
  const visit = (node: GenreTreeNode, root: GenreTreeNode) => {
    roots.set(node.slug, root);
    node.children.forEach((child) => visit(child, root));
  };
  tree.forEach((root) => visit(root, root));
  return countGenreBadges(albums.map((album) => {
    const items = discogsGenreBadges([
      ...(album.effective_genres ?? album.genres ?? []),
      ...(album.effective_styles ?? album.styles ?? []),
    ], lookup);
    const unique = new Map(items.flatMap((item) => {
      const root = item.slug ? roots.get(item.slug) : undefined;
      return root ? [[root.slug, { label: root.name, slug: root.slug }] as const] : [];
    }));
    return [...unique.values()];
  }), tree.length);
}
