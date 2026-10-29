import { queryKeys } from "@/lib/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import { upsertAlbumWithTracks } from "@/services/internalApi/albums";

export function useUpdateAlbumWithTracksMutation() {
  const queryClient = useQueryClient();
  const setAlbum = useAlbumStore((state) => state.setAlbum);
  const setTracks = useTrackStore((state) => state.setTracks);

  return useMutation({
    mutationFn: upsertAlbumWithTracks,
    onSuccess: (data, variables) => {
      if (data?.album) {
        setAlbum(data.album);
        useTrackStore
          .getState()
          .updateTracksByRelease(data.album.release_id, data.album.friend_id, {
            album_genres: data.album.effective_genres,
            album_styles: data.album.effective_styles,
          });
      }
      if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
        setTracks(data.tracks);
      }

      // Invalidate album detail query
      queryClient.invalidateQueries({
        queryKey: ["album", variables.release_id, variables.friend_id],
      });

      // Invalidate albums list
      queryClient.invalidateQueries({
        queryKey: ["albums"],
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.genresRoot() });

      // Invalidate tracks queries if tracks changed
      queryClient.invalidateQueries({
        queryKey: queryKeys.tracksRoot(),
      });
    },
  });
}
