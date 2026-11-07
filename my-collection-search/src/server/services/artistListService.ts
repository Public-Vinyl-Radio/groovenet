import type { ArtistListResponse } from "@/api-contract/schemas";
import { artistListRepository } from "@/server/repositories/artistListRepository";

export type ArtistListOptions = {
  q: string;
  friend_id?: number;
  include_placeholders: boolean;
  letter?: string;
  limit: number;
  offset: number;
};

/** `GET /api/artists` (#710): one page of the artist list and the total it came from. */
export async function listArtists(options: ArtistListOptions): Promise<ArtistListResponse> {
  const filter = {
    q: options.q,
    friendId: options.friend_id,
    includePlaceholders: options.include_placeholders,
    letter: options.letter,
  };
  const [items, total] = await Promise.all([
    artistListRepository.search(filter, options.limit, options.offset),
    artistListRepository.count(filter),
  ]);
  return { items, total, limit: options.limit, offset: options.offset, query: options.q };
}
