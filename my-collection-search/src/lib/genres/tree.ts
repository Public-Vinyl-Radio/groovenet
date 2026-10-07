import type { GenreTreeNode } from "@/api-contract/schemas";
import { normalizeGenreName } from "@/lib/genres/normalization";

/** A taxonomy node with its collection count, subgenres included, and only the children still shown. */
export type CountedGenreNode = { node: GenreTreeNode; count: number; children: CountedGenreNode[] };

function byCount(a: CountedGenreNode, b: CountedGenreNode): number {
  return b.count - a.count || a.node.name.localeCompare(b.node.name);
}

/**
 * Counts each node and prunes the tree for the `/genres` page (#376). A genre
 * stays when the collection holds any of it, or always with `showEmpty`; with
 * a search, only matches stay, with the genres above them for context and
 * everything below them. Biggest first at every level.
 */
export function countGenreTree(
  nodes: GenreTreeNode[],
  counts: ReadonlyMap<string, number>,
  options: { showEmpty: boolean; search: string }
): CountedGenreNode[] {
  const query = normalizeGenreName(options.search);
  const visit = (node: GenreTreeNode, ancestorMatched: boolean): CountedGenreNode | null => {
    const matched = ancestorMatched || query === "" || normalizeGenreName(node.name).includes(query);
    const children = node.children
      .map((child) => visit(child, matched))
      .filter((child): child is CountedGenreNode => child !== null)
      .sort(byCount);
    const count = counts.get(node.id) ?? 0;
    if (!options.showEmpty && count === 0) return null;
    if (!matched && children.length === 0) return null;
    return { node, count, children };
  };
  return nodes
    .map((node) => visit(node, false))
    .filter((node): node is CountedGenreNode => node !== null)
    .sort(byCount);
}
