import { http } from "@/services/http";
import type { GenreTreeNode } from "@/api-contract/schemas";

/** The whole genre taxonomy as a tree, with track and album counts. */
export async function fetchGenreTree(): Promise<GenreTreeNode[]> {
  const { genres } = await http<{ genres: GenreTreeNode[] }>("/api/genres");
  return genres;
}
