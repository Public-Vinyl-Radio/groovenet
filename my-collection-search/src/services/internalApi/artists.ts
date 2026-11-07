import { http } from "@/services/http";
import type { ArtistPageResponse } from "@/api-contract/schemas";
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
