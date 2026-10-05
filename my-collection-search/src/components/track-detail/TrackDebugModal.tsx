"use client";

import {
  Button,
  CloseButton,
  Dialog,
  Portal,
  VStack,
} from "@chakra-ui/react";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type {
  AudioVibeEmbeddingPreviewResponse,
  ContextEmbeddingPreviewResponse,
  IdentityEmbeddingPreviewResponse,
  TrackAudioMetadataResponse,
  TrackEssentiaResponse,
} from "@/services/internalApi/tracks";
import AudioMetadataSection from "./AudioMetadataSection";
import EssentiaSection from "./EssentiaSection";
import IdentityEmbeddingSection from "./IdentityEmbeddingSection";
import AudioVibeEmbeddingSection from "./AudioVibeEmbeddingSection";
import ContextEmbeddingSection from "./ContextEmbeddingSection";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audioMetadataQuery: UseQueryResult<TrackAudioMetadataResponse, Error>;
  essentiaQuery: UseQueryResult<TrackEssentiaResponse, Error>;
  identityEmbeddingPreviewQuery: UseQueryResult<IdentityEmbeddingPreviewResponse, Error>;
  contextEmbeddingPreviewQuery: UseQueryResult<ContextEmbeddingPreviewResponse, Error>;
  audioVibeEmbeddingPreviewQuery: UseQueryResult<AudioVibeEmbeddingPreviewResponse, Error>;
  trackAudioCoverUrl?: string | null;
  extractCoverMutation: UseMutationResult<string | null, Error, void, unknown>;
  onExtractCover: () => Promise<void>;
};

export default function TrackDebugModal({
  open,
  onOpenChange,
  audioMetadataQuery,
  essentiaQuery,
  identityEmbeddingPreviewQuery,
  contextEmbeddingPreviewQuery,
  audioVibeEmbeddingPreviewQuery,
  trackAudioCoverUrl,
  extractCoverMutation,
  onExtractCover,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)} size="xl">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="980px" maxH="90vh">
            <Dialog.Header>
              <Dialog.Title>Track Debug</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>

            <Dialog.Body overflowY="auto" pb={6}>
              <VStack align="stretch" gap={0}>
                <AudioMetadataSection
                  query={audioMetadataQuery}
                  trackAudioCoverUrl={trackAudioCoverUrl}
                  isExtractingCover={extractCoverMutation.isPending}
                  onExtractCover={onExtractCover}
                />
                <EssentiaSection query={essentiaQuery} />
                <IdentityEmbeddingSection query={identityEmbeddingPreviewQuery} />
                <ContextEmbeddingSection query={contextEmbeddingPreviewQuery} />
                <AudioVibeEmbeddingSection query={audioVibeEmbeddingPreviewQuery} />
              </VStack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
