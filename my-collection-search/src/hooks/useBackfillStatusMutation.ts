import { useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackStore } from "@/stores/trackStore";

type TrackStatus = "pending" | "enqueued" | "analyzing" | "success" | "error";

export type TrackStatusUpdate = {
  track_id: string;
  friend_id?: number; // enable precise store updates
  status?: TrackStatus;
  errorMsg?: string | null;
  progress?: number;
};

export function useBackfillStatusMutation() {
  const { updateTrack } = useTrackStore();

  return useMutation({
    mutationKey: queryKeys.tracksStatus(),
    mutationFn: async (updates: TrackStatusUpdate | TrackStatusUpdate[]) => {
      // No server call; this is purely optimistic UI update
      return Array.isArray(updates) ? updates : [updates];
    },
    onMutate: async (updates) => {
      const arr = Array.isArray(updates) ? updates : [updates];

      // Update tracks in Zustand store
      arr.forEach((update) => {
        const storeUpdate: {
          status?: TrackStatus;
          errorMsg?: string;
          progress?: number;
        } = {};
        if (update.status !== undefined) {
          storeUpdate.status = update.status;
        }
        if (update.errorMsg !== undefined) {
          storeUpdate.errorMsg = update.errorMsg ?? undefined;
        }
        if (update.progress !== undefined) {
          storeUpdate.progress = update.progress;
        }

        // Determine friend_id: use provided, else find from store by track_id
        let fid = update.friend_id;
        if (typeof fid !== "number") {
          const state = useTrackStore.getState();
          for (const t of state.tracks.values()) {
            if (t.track_id === update.track_id && typeof t.friend_id === "number") {
              fid = t.friend_id;
              break;
            }
          }
        }
        if (typeof fid === "number") {
          updateTrack(update.track_id, fid, storeUpdate);
        }
      });
    },
  });
}
