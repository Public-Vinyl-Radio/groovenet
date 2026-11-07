import { http } from "@/services/http";
import type { ArtistListResponse, ArtistPageResponse } from "@/api-contract/schemas";
import type { Album, Track } from "@/types/track";

/** The wire page with its entities typed as the app's own `Album` and `Track`. */
export type ArtistPage = Omit<ArtistPageResponse, "albums" | "top_tracks"> & {
  albums: (Album & { appears_on_tracks: number; appears_on_positions: string[] })[];
  top_tracks: Track[];
};

/** One artist's page (#707) by slug, optionally scoped to one collection. */
export async function fetchArtistPage(slug: string, friendId?: number): Promise<ArtistPage> {
  const path = `/api/artists/${encodeURIComponent(slug)}`;
  return http<ArtistPage>(friendId === undefined ? path : `${path}?friend_id=${friendId}`);
}

export type ArtistListParams = {
  q?: string;
  /** `A`..`Z`, or `#` for everything else (#709). */
  letter?: string;
  friend_id?: number;
  limit?: number;
  offset?: number;
};

/** One page of the artist list (#709, #710): by name or alias, or by index letter. */
export async function listArtists(params: ArtistListParams = {}): Promise<ArtistListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.letter) search.set("letter", params.letter);
  if (params.friend_id !== undefined) search.set("friend_id", String(params.friend_id));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  const query = search.toString();
  return http<ArtistListResponse>(query ? `/api/artists?${query}` : "/api/artists");
}
