"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useTrackByIdQuery } from "@/hooks/useTrackByIdQuery";
import {
  extractEmbeddedCover,
  fetchAudioVibeEmbeddingPreview,
  fetchIdentityEmbeddingPreview,
  fetchTrackAudioMetadata,
  fetchTrackEssentiaData,
  fetchTrackPlaylists,
} from "@/services/internalApi/tracks";

export function useTrackDetailQueries(trackId: string, friendId: number, enabled: boolean) {
  const trackQuery = useTrackByIdQuery(trackId, friendId, enabled);

  const playlistsQuery = useQuery({
    queryKey: queryKeys.trackPlaylists(trackId, friendId),
    queryFn: () => fetchTrackPlaylists(trackId, friendId),
    enabled: enabled && !!trackId,
  });

  const audioMetadataQuery = useQuery({
    queryKey: queryKeys.trackAudioMetadata(trackId, friendId),
    queryFn: () => fetchTrackAudioMetadata(trackId, friendId),
    enabled: enabled && !!trackId,
  });

  const essentiaQuery = useQuery({
    queryKey: queryKeys.trackEssentia(trackId, friendId),
    queryFn: () => fetchTrackEssentiaData(trackId, friendId),
    enabled: enabled && !!trackId,
  });

  const identityEmbeddingPreviewQuery = useQuery({
    queryKey: queryKeys.trackIdentityEmbeddingPreview(trackId, friendId),
    queryFn: () => fetchIdentityEmbeddingPreview(trackId, friendId),
    enabled: enabled && !!trackId,
  });

  const audioVibeEmbeddingPreviewQuery = useQuery({
    queryKey: queryKeys.trackAudioVibeEmbeddingPreview(trackId, friendId),
    queryFn: () => fetchAudioVibeEmbeddingPreview(trackId, friendId),
    enabled: enabled && !!trackId,
  });

  const extractCoverMutation = useMutation({
    mutationFn: () => extractEmbeddedCover(trackId, friendId),
  });

  return {
    trackQuery,
    playlistsQuery,
    audioMetadataQuery,
    essentiaQuery,
    identityEmbeddingPreviewQuery,
    audioVibeEmbeddingPreviewQuery,
    extractCoverMutation,
  };
}
