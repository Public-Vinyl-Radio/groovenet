"use client";

import RetroDialog from "@/components/ui/RetroDialog";

import { Flex, Box, Button, VStack } from "@chakra-ui/react";
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
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Track Debug"
      maxW="980px"

      footer={
        <Flex p={4} gap={2} flexWrap="wrap" justify="flex-end">
          <Button minH="44px" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </Flex>
      }
    >
      <Box p={4} minW={0}>
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
      </Box>
    </RetroDialog>
  );
}
