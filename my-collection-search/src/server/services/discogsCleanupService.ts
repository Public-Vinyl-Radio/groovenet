import { friendRepository } from "@/server/repositories/friendRepository";
import { trackRepository } from "@/server/repositories/trackRepository";
import { albumRepository } from "@/server/repositories/albumRepository";

type CleanupResult = {
  friendId: number | null;
  deletedTrackIds: string[];
  deletedTracksCount: number;
  deletedAlbumsCount: number;
  deletedFromSearchTracks: number;
  deletedFromSearchAlbums: number;
};

export async function cleanupDiscogsReleases(
  username: string,
  releaseIds: string[],
): Promise<CleanupResult> {
  if (releaseIds.length === 0) {
    return {
      friendId: null,
      deletedTrackIds: [],
      deletedTracksCount: 0,
      deletedAlbumsCount: 0,
      deletedFromSearchTracks: 0,
      deletedFromSearchAlbums: 0,
    };
  }

  const friendId = await friendRepository.findIdByUsername(username);
  if (!friendId) {
    return {
      friendId: null,
      deletedTrackIds: [],
      deletedTracksCount: 0,
      deletedAlbumsCount: 0,
      deletedFromSearchTracks: 0,
      deletedFromSearchAlbums: 0,
    };
  }

  const deletedTrackIds = await trackRepository.listTrackIdsByFriendAndReleaseIds(
    friendId,
    releaseIds,
  );
  const deletedAlbumsCount = await albumRepository.deleteAlbumsByFriendAndReleaseIds(
    friendId,
    releaseIds,
  );
  const deletedTracksCount = await trackRepository.deleteTracksByFriendAndReleaseIds(
    friendId,
    releaseIds,
  );

  return {
    friendId,
    deletedTrackIds,
    deletedTracksCount,
    deletedAlbumsCount,
    deletedFromSearchTracks: 0,
    deletedFromSearchAlbums: 0,
  };
}
