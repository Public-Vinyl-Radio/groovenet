import { http } from "@/services/http";
import type { GenrePageResponse, GenreTreeNode } from "@/api-contract/schemas";

/** The whole genre taxonomy as a tree, with track and album counts. */
export async function fetchGenreTree(): Promise<GenreTreeNode[]> {
  const { genres } = await http<{ genres: GenreTreeNode[] }>("/api/genres");
  return genres;
}

/** One genre's page (#376), by slug or id, optionally scoped to one collection. */
export async function fetchGenrePage(ref: string, friendId?: number): Promise<GenrePageResponse> {
  const path = `/api/genres/${encodeURIComponent(ref)}`;
  return http<GenrePageResponse>(friendId === undefined ? path : `${path}?friend_id=${friendId}`);
}
