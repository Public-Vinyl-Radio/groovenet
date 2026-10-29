import { useAlbumStore } from "@/stores/albumStore";
import type { AlbumEntity } from "@/stores/albumStore";
import { useMemo } from "react";

export type AlbumRef = { releaseId: string; friendId: number };

export function useAlbum(releaseId: string, friendId: number): AlbumEntity | undefined {
  return useAlbumStore((state) => state.albums.get(`${releaseId}:${friendId}`));
}

export function useAlbumsByRefs(refs: AlbumRef[]): AlbumEntity[] {
  const albumsMap = useAlbumStore((state) => state.albums);
  return useMemo(
    () =>
      refs
        .map((r) => albumsMap.get(`${r.releaseId}:${r.friendId}`))
        .filter((album): album is AlbumEntity => album !== undefined),
    [albumsMap, refs],
  );
}

export function useAlbumHydrated(releaseId: string, friendId: number): boolean {
  return useAlbumStore((state) => state.hydratedAlbumKeys.has(`${releaseId}:${friendId}`));
}
