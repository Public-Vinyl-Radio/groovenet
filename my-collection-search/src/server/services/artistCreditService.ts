import type { ArtistCreditRef } from "@/api-contract/schemas";
import { artistCreditRepository, creditKey } from "@/server/repositories/artistCreditRepository";

type AlbumRow = { release_id: string; friend_id: number };
type TrackRow = { track_id: string; friend_id: number; release_id?: string | null };

/**
 * Structured `artists` credits on album and track responses (#710), the same
 * rule the artist page uses: a track's own credits, else its album's. `artist`
 * stays the display string. Rows with no credits at all get `[]`.
 */
export async function withArtistCredits<A extends AlbumRow, T extends TrackRow>(
  albums: A[],
  tracks: T[],
): Promise<{
  albums: (A & { artists: ArtistCreditRef[] })[];
  tracks: (T & { artists: ArtistCreditRef[] })[];
}> {
  const albumKeys = new Map<string, AlbumRow>();
  for (const a of albums) albumKeys.set(creditKey(a.release_id, a.friend_id), a);
  for (const t of tracks) {
    if (t.release_id) {
      const key = { release_id: t.release_id, friend_id: t.friend_id };
      albumKeys.set(creditKey(t.release_id, t.friend_id), key);
    }
  }

  const [albumCredits, trackCredits] = await Promise.all([
    artistCreditRepository.forAlbums(
      [...albumKeys.values()].map((a) => ({ id: a.release_id, friend_id: a.friend_id })),
    ),
    artistCreditRepository.forTracks(
      tracks.map((t) => ({ id: t.track_id, friend_id: t.friend_id })),
    ),
  ]);

  return {
    albums: albums.map((a) => ({
      ...a,
      artists: albumCredits.get(creditKey(a.release_id, a.friend_id)) ?? [],
    })),
    tracks: tracks.map((t) => ({
      ...t,
      artists:
        trackCredits.get(creditKey(t.track_id, t.friend_id)) ??
        (t.release_id ? albumCredits.get(creditKey(t.release_id, t.friend_id)) : undefined) ??
        [],
    })),
  };
}
