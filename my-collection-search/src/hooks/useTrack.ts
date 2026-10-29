import { useTrackStore } from "@/stores/trackStore";
import type { TrackEntity } from "@/stores/trackStore";
import { useMemo } from "react";

/**
 * Hook to get a single track from the store
 */
export function useTrack(trackId: string, friendId: number): TrackEntity | undefined {
  return useTrackStore((state) => {
    const keyExact = `${trackId}:${friendId}`;
    const tExact = state.tracks.get(keyExact);
    if (tExact) return tExact;

    return undefined;
  });
}

/**
 * Hook to get multiple tracks from the store
 * Returns tracks in the same order as trackIds
 */
export function useTracks(trackIds: string[], friendId: number): TrackEntity[] {
  return useTrackStore((state) =>
    trackIds
      .map((id) => {
        const key = `${id}:${friendId}`;
        return state.tracks.get(key);
      })
      .filter((track): track is TrackEntity => track !== undefined),
  );
}

export function useTracksByRelease(releaseId: string, friendId: number): TrackEntity[] {
  const tracksMap = useTrackStore((state) => state.tracks);
  const trackKeysByRelease = useTrackStore((state) => state.trackKeysByRelease);

  return useMemo(() => {
    const keys = trackKeysByRelease.get(`${releaseId}:${friendId}`) ?? [];
    return keys
      .map((k) => tracksMap.get(k))
      .filter((track): track is TrackEntity => track !== undefined);
  }, [tracksMap, trackKeysByRelease, releaseId, friendId]);
}

export function useTracksByReleaseHydrated(releaseId: string, friendId: number): boolean {
  return useTrackStore((state) => state.hydratedReleaseKeys.has(`${releaseId}:${friendId}`));
}

/**
 * Hook to check if a track exists in the store
 */
export function useHasTrack(trackId: string, friendId: number): boolean {
  return useTrackStore((state) => {
    const key = `${trackId}:${friendId}`;
    return state.tracks.has(key);
  });
}
