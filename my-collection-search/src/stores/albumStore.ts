import { create } from "zustand";
import type { Album } from "@/types/track";
import { diffObjectKeys, isStoreDebugEnabled, storeLog } from "@/lib/devLogger";

export type AlbumEntity = Album;

interface AlbumStore {
  albums: Map<string, AlbumEntity>;
  hydratedAlbumKeys: Set<string>;
  setAlbum: (album: AlbumEntity) => void;
  setAlbums: (albums: AlbumEntity[]) => void;
  markAlbumHydrated: (releaseId: string, friendId: number) => void;
  isAlbumHydrated: (releaseId: string, friendId: number) => boolean;
  updateAlbum: (releaseId: string, friendId: number, updates: Partial<AlbumEntity>) => void;
  getAlbum: (releaseId: string, friendId: number) => AlbumEntity | undefined;
  hasAlbum: (releaseId: string, friendId: number) => boolean;
  clearAlbums: () => void;
  _preserveFields: Array<keyof AlbumEntity>;
}

const createAlbumKey = (releaseId: string, friendId: number): string => `${releaseId}:${friendId}`;

export const useAlbumStore = create<AlbumStore>((set, get) => ({
  albums: new Map<string, AlbumEntity>(),
  hydratedAlbumKeys: new Set<string>(),
  _preserveFields: [
    "album_rating",
    "album_notes",
    "purchase_price",
    "condition",
    "library_identifier",
  ] as Array<keyof AlbumEntity>,

  setAlbum: (album: AlbumEntity) => {
    set((state) => {
      const key = createAlbumKey(album.release_id, album.friend_id);
      const prev = state.albums.get(key);
      const next = new Map(state.albums);
      next.set(key, album);

      if (isStoreDebugEnabled()) {
        storeLog("setAlbum", [
          ["key", key],
          ["prev", prev],
          ["next", album],
          [
            "diff",
            diffObjectKeys(
              (prev as unknown as Record<string, unknown>) ?? {},
              album as unknown as Record<string, unknown>,
            ),
          ],
        ]);
      }
      const hydrated = new Set(state.hydratedAlbumKeys);
      hydrated.add(key);
      return { albums: next, hydratedAlbumKeys: hydrated };
    });
  },

  setAlbums: (albums: AlbumEntity[]) => {
    set((state) => {
      let hasChanges = false;
      const next = new Map(state.albums);

      for (const album of albums) {
        const key = createAlbumKey(album.release_id, album.friend_id);
        const existing = state.albums.get(key);
        let merged: AlbumEntity = album;

        if (existing) {
          const preserved: Partial<AlbumEntity> = {};
          for (const field of get()._preserveFields) {
            (preserved as Record<string, unknown>)[field] = existing[field];
          }
          merged = { ...album, ...preserved };
          const diff = diffObjectKeys(
            existing as unknown as Record<string, unknown>,
            merged as unknown as Record<string, unknown>,
          );
          if (Object.keys(diff).length === 0) continue;
        }

        next.set(key, merged);
        hasChanges = true;
      }

      if (!hasChanges) return state;
      const hydrated = new Set(state.hydratedAlbumKeys);
      for (const album of albums) {
        hydrated.add(createAlbumKey(album.release_id, album.friend_id));
      }
      return { albums: next, hydratedAlbumKeys: hydrated };
    });
  },

  markAlbumHydrated: (releaseId: string, friendId: number) => {
    set((state) => {
      const key = createAlbumKey(releaseId, friendId);
      if (state.hydratedAlbumKeys.has(key)) return state;
      const hydrated = new Set(state.hydratedAlbumKeys);
      hydrated.add(key);
      return { hydratedAlbumKeys: hydrated };
    });
  },

  isAlbumHydrated: (releaseId: string, friendId: number) =>
    get().hydratedAlbumKeys.has(createAlbumKey(releaseId, friendId)),

  updateAlbum: (releaseId: string, friendId: number, updates: Partial<AlbumEntity>) => {
    set((state) => {
      const key = createAlbumKey(releaseId, friendId);
      const existing = state.albums.get(key);
      if (!existing) return state;

      const updated = { ...existing, ...updates };
      const diff = diffObjectKeys(
        existing as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
      if (Object.keys(diff).length === 0) return state;

      const next = new Map(state.albums);
      next.set(key, updated);
      return { albums: next };
    });
  },

  getAlbum: (releaseId: string, friendId: number) =>
    get().albums.get(createAlbumKey(releaseId, friendId)),

  hasAlbum: (releaseId: string, friendId: number) =>
    get().albums.has(createAlbumKey(releaseId, friendId)),

  clearAlbums: () =>
    set({ albums: new Map<string, AlbumEntity>(), hydratedAlbumKeys: new Set<string>() }),
}));
