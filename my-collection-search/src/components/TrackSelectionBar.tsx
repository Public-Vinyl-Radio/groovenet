"use client";
import React from "react";
import { Box, Flex, Text, Button } from "@chakra-ui/react";
import { usePlaybackPlayer } from "@/providers/PlaybackTargetProvider";
import { getMobileBottomOverlayOffset } from "@/lib/mobileLayout";

interface TrackSelectionBarProps {
  selectedCount: number;
  loadedCount: number;
  downloadableCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onEnrich: () => void;
  onDownloadAudio: () => void;
}

export default function TrackSelectionBar({
  selectedCount,
  loadedCount,
  downloadableCount,
  onSelectAll,
  onClear,
  onEnrich,
  onDownloadAudio,
}: TrackSelectionBarProps) {
  const { playlistLength } = usePlaybackPlayer();
  const mobileBottomOverlayOffset = getMobileBottomOverlayOffset(playlistLength);

  if (selectedCount === 0) return null;

  return (
    <Box
      position="fixed"
      bottom={mobileBottomOverlayOffset}
      left={0}
      right={0}
      bg="bg"
      borderTopWidth="1px"
      pt={3}
      pb={{ base: "max(env(safe-area-inset-bottom), 12px)", md: 3 }}
      px={4}
      zIndex={100}
      shadow="lg"
    >
      <Flex
        direction={{ base: "column", md: "row" }}
        gap={{ base: 2, md: 0 }}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        maxW="4xl"
        mx="auto"
      >
        <Flex align="center" gap={3}>
          <Text fontWeight="semibold" fontSize="sm">
            {selectedCount} track{selectedCount !== 1 ? "s" : ""} selected
          </Text>
          {selectedCount < loadedCount && (
            <Button size="xs" variant="ghost" onClick={onSelectAll}>
              Select all {loadedCount}
            </Button>
          )}
          <Button size="xs" variant="ghost" colorPalette="danger" onClick={onClear}>
            Clear
          </Button>
        </Flex>
        <Flex gap={2}>
          {downloadableCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadAudio}
              flex={{ base: 1, md: "none" }}
            >
              Download ({downloadableCount})
            </Button>
          )}
          <Button size="sm" colorPalette="accent" onClick={onEnrich} flex={{ base: 1, md: "none" }}>
            Enrich {selectedCount} →
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
