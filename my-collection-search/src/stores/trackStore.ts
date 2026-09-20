import { create } from 'zustand';
import type { Track } from '@/types/track';
import { diffObjectKeys, isStoreDebugEnabled, storeLog } from '@/lib/devLogger';

export type TrackEntity = Track & {
  status?: "pending" | "enqueued" | "analyzing" | "success" | "error";
  errorMsg?: string;
  progress?: number;
};

interface TrackStore {
  tracks: Map<string, TrackEntity>;
  trackKeysByRelease: Map<string, string[]>;
  hydratedReleaseKeys: Set<string>;
  setTrack: (track: TrackEntity) => void;
  setTracks: (tracks: TrackEntity[]) => void;
  markReleaseHydrated: (releaseId: string, friendId: number) => void;
  isReleaseHydrated: (releaseId: string, friendId: number) => boolean;
  updateTrack: (trackId: string, friendId: number, updates: Partial<TrackEntity>) => void;
  updateTracksByRelease: (releaseId: string, friendId: number, updates: Partial<TrackEntity>) => void;
  getTrack: (trackId: string, friendId?: number) => TrackEntity | undefined;
  hasTrack: (trackId: string, friendId?: number) => boolean;
  clearTracks: () => void;
  // internal: list of fields we preserve on setTracks to prevent stale seeds from clobbering local edits
  _preserveFields: Array<keyof TrackEntity>;
}

const createTrackKey = (trackId: string, friendId?: number): string => {
  return `${trackId}:${friendId || 'default'}`;
};

const createReleaseKey = (releaseId: string, friendId: number): string => {
  return `${releaseId}:${friendId}`;
};

function buildReleaseIndex(tracks: Map<string, TrackEntity>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [trackKey, track] of tracks.entries()) {
    if (!track.release_id || typeof track.friend_id !== "number") continue;
    const releaseKey = createReleaseKey(track.release_id, track.friend_id);
    const existing = index.get(releaseKey);
    if (existing) {
      existing.push(trackKey);
    } else {
      index.set(releaseKey, [trackKey]);
    }
  }
  return index;
}

export const useTrackStore = create<TrackStore>((set, get) => ({
  tracks: new Map<string, TrackEntity>(),
  trackKeysByRelease: new Map<string, string[]>(),
  hydratedReleaseKeys: new Set<string>(),

  // Fields that are typically user-mutated locally and should not be clobbered
  // by background cache seeds (search results) unless explicitly updated.
  // Adjust this list as needed.
  // Note: server-confirmed updates should write via setTrack/updateTrack, not via setTracks.
  _preserveFields: [
    'star_rating',
    'notes',
    'bpm',
    'key',
    'local_tags',
    'danceability',
    'mood_happy',
    'mood_sad',
    'mood_relaxed',
    'mood_aggressive',
  ] as Array<keyof TrackEntity>,

  setTrack: (track: TrackEntity) => {
    set((state) => {
      const key = createTrackKey(track.track_id, track.friend_id);
      const prev = state.tracks.get(key);
      const newTracks = new Map(state.tracks);
      newTracks.set(key, track);

      if (isStoreDebugEnabled()) {
        storeLog('setTrack', [
          ['key', key],
          ['friend_id', track.friend_id],
          ['prev', prev],
          ['next', track],
          ['diff', diffObjectKeys(prev as unknown as Record<string, unknown>, track as unknown as Record<string, unknown>)],
        ]);
      }
      return {
        tracks: newTracks,
        trackKeysByRelease: buildReleaseIndex(newTracks),
      };
    });
  },

  setTracks: (tracks: TrackEntity[]) => {
    set((state) => {
      let hasChanges = false;
      const newTracks = new Map(state.tracks);

      tracks.forEach((track) => {
        const friendId = track.friend_id;
        const key = createTrackKey(track.track_id, friendId);
        const existing = state.tracks.get(key);
        // Merge strategy: preserve selected fields from existing to avoid stale seeds clobbering local updates
        let nextValue: TrackEntity;
        if (existing) {
          const preserved: Partial<TrackEntity> = {};
          for (const f of get()._preserveFields) {
            // @ts-expect-error index by keyof Track
            preserved[f] = existing[f];
          }
          nextValue = { ...track, ...preserved } as TrackEntity;
          // If nothing actually changed after merge, skip write
          const diff = diffObjectKeys(existing as unknown as Record<string, unknown>, nextValue as unknown as Record<string, unknown>);
          const changed = Object.keys(diff).length > 0;
          if (changed) {
            newTracks.set(key, nextValue);
            hasChanges = true;
            if (isStoreDebugEnabled()) {
              storeLog('setTracks:item', [
                ['key', key],
                ['friendId', friendId],
                ['prev', existing],
                ['incoming', track],
                ['merged', nextValue],
                ['diff', diff],
              ]);
            }
          }
        } else {
          // New entry
          newTracks.set(key, track);

          hasChanges = true;
          if (isStoreDebugEnabled()) {
            storeLog('setTracks:item:new', [
              ['key', key],
              ['friendId', friendId],
              ['next', track],
            ]);
          }
        }
      });

      // Only return new state if there were actual changes
      if (hasChanges) {
        if (isStoreDebugEnabled()) {
          storeLog('setTracks:commit', [
            ['count', tracks.length],
          ]);
        }
        return {
          tracks: newTracks,
          trackKeysByRelease: buildReleaseIndex(newTracks),
        };
      }
      return state;
    });
  },

  markReleaseHydrated: (releaseId: string, friendId: number) => {
    set((state) => {
      const key = createReleaseKey(releaseId, friendId);
      if (state.hydratedReleaseKeys.has(key)) return state;
      const hydrated = new Set(state.hydratedReleaseKeys);
      hydrated.add(key);
      return { hydratedReleaseKeys: hydrated };
    });
  },

  isReleaseHydrated: (releaseId: string, friendId: number) =>
    get().hydratedReleaseKeys.has(createReleaseKey(releaseId, friendId)),

  updateTrack: (trackId: string, friendId: number, updates: Partial<TrackEntity>) => {
    set((state) => {
      const key = createTrackKey(trackId, friendId);
      const existingTrack = state.tracks.get(key);
      if (!existingTrack) {
        if (isStoreDebugEnabled()) {
          storeLog('updateTrack:miss', [
            ['key', key],
            ['updates', updates],
          ]);
        }
        return state;
      }

      const newTracks = new Map(state.tracks);
      const updatedTrack = { ...existingTrack, ...updates };
      newTracks.set(key, updatedTrack);

      if (isStoreDebugEnabled()) {
        storeLog('updateTrack', [
          ['key', key],
          ['prev', existingTrack],
          ['updates', updates],
          ['next', updatedTrack],
          ['diff', diffObjectKeys(existingTrack as unknown as Record<string, unknown>, updatedTrack as unknown as Record<string, unknown>)],
        ]);
      }
      return {
        tracks: newTracks,
        trackKeysByRelease: buildReleaseIndex(newTracks),
      };
    });
  },

  updateTracksByRelease: (releaseId: string, friendId: number, updates: Partial<TrackEntity>) => {
    set((state) => {
      let hasChanges = false;
      const newTracks = new Map(state.tracks);

      for (const [key, track] of state.tracks.entries()) {
        if (track.release_id !== releaseId || track.friend_id !== friendId) continue;

        const updatedTrack = { ...track, ...updates };
        const diff = diffObjectKeys(
          track as unknown as Record<string, unknown>,
          updatedTrack as unknown as Record<string, unknown>
        );
        if (Object.keys(diff).length === 0) continue;

        newTracks.set(key, updatedTrack);
        hasChanges = true;

        if (isStoreDebugEnabled()) {
          storeLog('updateTracksByRelease:item', [
            ['key', key],
            ['release_id', releaseId],
            ['friend_id', friendId],
            ['updates', updates],
            ['diff', diff],
          ]);
        }
      }

      if (!hasChanges) return state;
      if (isStoreDebugEnabled()) {
        storeLog('updateTracksByRelease:commit', [
          ['release_id', releaseId],
          ['friend_id', friendId],
        ]);
      }
      return {
        tracks: newTracks,
        trackKeysByRelease: buildReleaseIndex(newTracks),
      };
    });
  },

  getTrack: (trackId: string, friendId?: number) => {
    const key = createTrackKey(trackId, friendId);
    return get().tracks.get(key);
  },


  hasTrack: (trackId: string, friendId?: number) => {
    const key = createTrackKey(trackId, friendId);
    return get().tracks.has(key);
  },

  clearTracks: () => {
    if (isStoreDebugEnabled()) {
      storeLog('clearTracks');
    }
    set({
      tracks: new Map(),
      trackKeysByRelease: new Map(),
      hydratedReleaseKeys: new Set<string>(),
    });
  },
}));
