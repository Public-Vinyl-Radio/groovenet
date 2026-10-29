import { friendRepository } from "@/server/repositories/friendRepository";
import { trackRepository } from "@/server/repositories/trackRepository";
import type { DiscogsTrack, Track } from "@/types/track";

export type TrackUpsertFailure = {
  trackId: string;
  releaseId?: string;
  username: string;
  error: string;
};

export type TrackUpsertResult = {
  upserted: Track[];
  errors: TrackUpsertFailure[];
};

export async function upsertTracks(tracks: DiscogsTrack[]): Promise<TrackUpsertResult> {
  const usernames = Array.from(
    new Set(tracks.map((t) => t.username).filter((u): u is string => !!u)),
  );

  if (usernames.length > 0) {
    await friendRepository.insertFriendsIfMissing(usernames);
  }

  const friendMap = new Map<string, number>();
  if (usernames.length > 0) {
    const friends = await friendRepository.listByUsernames(usernames);
    for (const friend of friends) {
      friendMap.set(friend.username, friend.id);
    }
  }

  const upserted: Track[] = [];
  const errors: TrackUpsertFailure[] = [];

  for (const track of tracks) {
    try {
      let friendId = friendMap.get(track.username);

      if (!friendId) {
        await friendRepository.insertFriendIfMissing(track.username);
        const resolvedId = await friendRepository.findIdByUsername(track.username);
        if (resolvedId) {
          friendId = resolvedId;
          friendMap.set(track.username, resolvedId);
        }
      }

      if (!friendId) {
        throw new Error(`Could not resolve friend_id for username='${track.username}'`);
      }

      const row = await trackRepository.upsertDiscogsTrackByTrackIdUsername(track, friendId);
      // A null row is an intentional no-op for a soft-deleted track.
      if (row) upserted.push(row);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({
        trackId: track.track_id,
        releaseId: track.release_id,
        username: track.username,
        error: errorMessage,
      });
      console.warn(
        `[Discogs Index] Failed to upsert ${track.track_id}@${track.username}: ${errorMessage}`,
      );
    }
  }

  return { upserted, errors };
}
