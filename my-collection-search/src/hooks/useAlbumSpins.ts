import { useSpinsQuery } from "@/hooks/useSpinsQuery";

/** How many spins the album page loads; its stats and its panel share the one query. */
export const ALBUM_SPINS_PAGE = 8;

export function useAlbumSpins(releaseId: string, friendId: number) {
  return useSpinsQuery(
    { friend_id: friendId, release_id: releaseId, limit: ALBUM_SPINS_PAGE, offset: 0 },
    { enabled: !!releaseId && !!friendId },
  );
}
