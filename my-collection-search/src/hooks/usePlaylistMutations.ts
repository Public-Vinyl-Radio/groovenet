import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  generateOptimizedPlaylist,
  type PlaylistOptimizerMode,
  updatePlaylist,
} from "@/services/internalApi/playlists";
import type { Track } from "@/types/track";
import { useTrackStore } from "@/stores/trackStore";
import { toaster } from "@/components/ui/toaster";
import {
  buildCompatibilityGraph,
  greedyPath,
  keyToCamelot,
  TrackCompat,
} from "@/lib/playlistOrder";
import posthog from "posthog-js";

export type SortPositionChange = {
  previousPosition: number;
  currentPosition: number;
};

/**
 * Hook for playlist mutation operations (sort, clear, reorder)
 * Works with query-based playlist data
 */
export function usePlaylistMutations(playlistId?: number, onModified?: () => void) {
  const queryClient = useQueryClient();
  const { getTrack } = useTrackStore();
  const [sortPositionChanges, setSortPositionChanges] = useState<
    Record<string, SortPositionChange>
  >({});

  // Get current track refs (track_id + friend_id) from cache
  type TrackRef = { track_id: string; friend_id: number };
  const getTrackIds = (): TrackRef[] => {
    if (!playlistId) return [];
    const cached = queryClient.getQueryData(
      queryKeys.playlistTrackIds(playlistId)
    );
    if (!cached) return [];
    if (Array.isArray(cached)) {
      return cached.filter(
        (r): r is TrackRef =>
          !!r &&
          typeof (r as { track_id?: unknown }).track_id === "string" &&
          typeof (r as { friend_id?: unknown }).friend_id === "number"
      );
    }
    // If legacy shape (object with tracks)
    if (
      typeof cached === "object" &&
      cached !== null &&
      Array.isArray((cached as { tracks?: unknown }).tracks)
    ) {
      return (cached as { tracks: unknown[] }).tracks.filter(
        (r): r is TrackRef =>
          !!r &&
          typeof (r as { track_id?: unknown }).track_id === "string" &&
          typeof (r as { friend_id?: unknown }).friend_id === "number"
      );
    }
    return [];
  };

  // Update track refs in cache
  const updateTrackRefs = (newTrackRefs: TrackRef[]) => {
    if (!playlistId) return;
    queryClient.setQueryData(
      queryKeys.playlistTrackIds(playlistId),
      (prev: unknown) => {
        // If previous data had playlist metadata, preserve it
        if (
          prev &&
          typeof prev === "object" &&
          !Array.isArray(prev) &&
          "tracks" in (prev as { tracks?: unknown })
        ) {
          const prevObj = prev as {
            tracks?: TrackRef[];
            playlist_name?: string | null;
            playlist_id?: number;
          };
          return {
            ...prevObj,
            tracks: newTrackRefs,
          };
        }
        return newTrackRefs;
      }
    );
  };

  const clearSortPositionChanges = () => {
    setSortPositionChanges({});
  };

  const getPositionChangeKey = (ref: TrackRef, index: number) =>
    `${ref.track_id}:${ref.friend_id}:${index}`;

  const buildPositionChanges = (
    previousRefs: TrackRef[],
    sortedRefs: TrackRef[]
  ) => {
    const previousPositionQueues = new Map<string, number[]>();
    previousRefs.forEach((ref, index) => {
      const key = `${ref.track_id}:${ref.friend_id}`;
      const queue = previousPositionQueues.get(key) ?? [];
      queue.push(index + 1);
      previousPositionQueues.set(key, queue);
    });

    const changes: Record<string, SortPositionChange> = {};
    sortedRefs.forEach((ref, index) => {
      const key = `${ref.track_id}:${ref.friend_id}`;
      const previousPosition = previousPositionQueues.get(key)?.shift();
      const currentPosition = index + 1;
      if (previousPosition && previousPosition !== currentPosition) {
        changes[getPositionChangeKey(ref, index)] = {
          previousPosition,
          currentPosition,
        };
      }
    });
    return changes;
  };

  // Move track from one position to another
  const moveTrack = (fromIdx: number, toIdx: number) => {
    clearSortPositionChanges();
    const trackRefs = getTrackIds();
    if (
      fromIdx < 0 ||
      fromIdx >= trackRefs.length ||
      toIdx < 0 ||
      toIdx >= trackRefs.length
    ) {
      return;
    }

    const newRefs = [...trackRefs];
    const [moved] = newRefs.splice(fromIdx, 1);
    newRefs.splice(toIdx, 0, moved);

    updateTrackRefs(newRefs);
    onModified?.(); // Mark as modified
  };

  // Mutation for removing a single track instance from playlist by index
  const removeTrackMutation = useMutation({
    mutationFn: async (indexToRemove: number) => {
      if (!playlistId) throw new Error("No playlist ID");
      const trackRefs = getTrackIds();
      if (indexToRemove < 0 || indexToRemove >= trackRefs.length) {
        return trackRefs;
      }
      const newRefs = [...trackRefs];
      newRefs.splice(indexToRemove, 1);
      await updatePlaylist(playlistId, { tracks: newRefs });
      return newRefs;
    },
    onSuccess: (newRefs) => {
      updateTrackRefs(newRefs);
      onModified?.(); // Mark as modified
      toaster.create({ title: "Track removed from playlist", type: "success" });
    },
    onError: (error) => {
      console.error("Failed to remove track from playlist:", error);
      toaster.create({ title: "Failed to remove track from playlist", type: "error" });
    }
  });

  // Mutation for adding track to playlist
  const addTrackMutation = useMutation({
    mutationFn: async (track: Track) => {
      if (!playlistId) throw new Error("No playlist ID");
      const trackRefs = getTrackIds();
      if (trackRefs.some((r) => r.track_id === track.track_id)) {
        return trackRefs; // Track already exists, no change needed
      }
      const newRefs = [...trackRefs, { track_id: track.track_id, friend_id: track.friend_id! }];
      await updatePlaylist(playlistId, { tracks: newRefs });
      return newRefs;
    },
    onSuccess: (newRefs, track) => {
      updateTrackRefs(newRefs);
      onModified?.(); // Mark as modified
      toaster.create({ title: `"${track.title}" added to playlist`, type: "success" });
    },
    onError: (error) => {
      console.error("Failed to add track to playlist:", error);
      toaster.create({ title: "Failed to add track to playlist", type: "error" });
    }
  });

  // Remove track from playlist (with server persistence)
  const removeFromPlaylist = (indexToRemove: number) => {
    clearSortPositionChanges();
    removeTrackMutation.mutate(indexToRemove);
  };

  // Add track to playlist (with server persistence)
  const addToPlaylist = (track: Track) => {
    clearSortPositionChanges();
    addTrackMutation.mutate(track);
  };

  // Clear entire playlist
  const clearPlaylist = () => {
    clearSortPositionChanges();
    updateTrackRefs([]);
  };

  // Sort playlist using greedy algorithm
  const sortGreedy = () => {
    const trackRefs = getTrackIds();
    const previousRefs = [...trackRefs];
    console.log("Greedy sort track refs:", trackRefs);
    if (trackRefs.length === 0) return;

    const tracks = trackRefs
      .map((ref) => {
        let track = getTrack(ref.track_id, ref.friend_id); // Try without specific friend_id first
        if (!track) {
          track = useTrackStore
            .getState()
            .getTrack(ref.track_id, ref.friend_id);
        }
        return track;
      })
      .filter(Boolean) as Track[];


    if (tracks.length === 0) {
      console.warn(
        "No tracks found in store for IDs:",
        trackRefs.map((r) => r.track_id)
      );
      return;
    }

    // Apply greedy sorting algorithm
    const enrichedPlaylist = tracks.map((track, idx) => {
      const t = track as TrackCompat;
      return {
        camelot_key: keyToCamelot(t.key),
        _vectors: t._vectors,
        energy: typeof t.energy === "number" ? t.energy : Number(t.energy) || 0,
        bpm: typeof t.bpm === "number" ? t.bpm : Number(t.bpm) || 0,
        idx,
      };
    });

    const compatibilityEdges = buildCompatibilityGraph(enrichedPlaylist);
    const optimalPath = greedyPath(enrichedPlaylist, compatibilityEdges);

    // Reorder track refs based on optimal path
    const sortedTrackRefs = optimalPath.map((orderIdx) => {
      const track = tracks[enrichedPlaylist[orderIdx].idx];
      return { track_id: track.track_id, friend_id: track.friend_id! };
    });
    console.log("Greedy sorted track refs:", sortedTrackRefs);

    setSortPositionChanges(buildPositionChanges(previousRefs, sortedTrackRefs));
    updateTrackRefs(sortedTrackRefs);
    onModified?.(); // Mark as modified

    // PostHog: Track playlist sorting
    posthog.capture("playlist_sorted", {
      playlist_id: playlistId,
      track_count: tracks.length,
      sort_algorithm: "greedy",
    });
  };

  // Server-backed optimizer mutation
  const optimizerMutation = useMutation({
    mutationFn: async (mode: PlaylistOptimizerMode) => {
      const trackRefs = getTrackIds();
      if (trackRefs.length === 0) {
        return { mode, previousRefs: trackRefs, sortedTracks: [] };
      }
      const previousRefs = [...trackRefs];

      // Get full track objects from track store for genetic algorithm
      const tracks = trackRefs
        .map((ref) => {
          let track = getTrack(ref.track_id);
          if (!track) {
            track = useTrackStore
              .getState()
              .getTrack(ref.track_id, ref.friend_id);
          }
          return track;
        })
        .filter(Boolean) as Track[];

      if (tracks.length === 0) {
        return { mode, previousRefs, sortedTracks: [] };
      }

      const sortedTracks = await generateOptimizedPlaylist(tracks, mode);
      return { mode, previousRefs, sortedTracks };
    },
    onSuccess: ({ mode, previousRefs, sortedTracks }) => {
      if (sortedTracks.length > 0) {
        const sortedTrackRefs = sortedTracks.map((track) => ({
          track_id: track.track_id,
          friend_id: track.friend_id!
        }));
        setSortPositionChanges(
          buildPositionChanges(previousRefs, sortedTrackRefs)
        );
        updateTrackRefs(sortedTrackRefs);
        onModified?.(); // Mark as modified

        // PostHog: Track playlist sorting
        posthog.capture("playlist_sorted", {
          playlist_id: playlistId,
          track_count: sortedTracks.length,
          sort_algorithm: mode,
        });
      }
    },
    onError: (error, mode) => {
      console.error(`Error during ${mode} sort:`, error);
      let details = "";
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message) as {
            error?: string;
            invalid?: Array<{ track_id?: string; reason?: string }>;
          };
          if (parsed?.invalid?.length) {
            const ids = parsed.invalid
              .map((i) => i.track_id)
              .filter(Boolean)
              .slice(0, 5)
              .join(", ");
            details = `Missing data for ${parsed.invalid.length} tracks${
              ids ? ` (e.g. ${ids})` : ""
            }.`;
          } else if (parsed?.error) {
            details = parsed.error;
          }
        } catch {
          // ignore parsing failures
        }
      }
      toaster.create({
        title:
          mode === "cohesive_blocks"
            ? "Cohesive blocks sort failed"
            : "Genetic sort failed",
        description: details || (error instanceof Error ? error.message : String(error)),
        type: "error",
      });
    },
  });

  const sortGenetic = () => {
    optimizerMutation.mutate("genetic");
  };

  const sortCohesiveBlocks = () => {
    optimizerMutation.mutate("cohesive_blocks");
  };

  return {
    moveTrack,
    removeFromPlaylist,
    addToPlaylist,
    clearPlaylist,
    sortGreedy,
    sortGenetic,
    sortCohesiveBlocks,
    isGeneticSorting:
      optimizerMutation.isPending && optimizerMutation.variables === "genetic",
    isCohesiveBlocksSorting:
      optimizerMutation.isPending &&
      optimizerMutation.variables === "cohesive_blocks",
    sortPositionChanges,
  };
}
