"use client";

import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FileInfoDetails } from "@/components/player/FileInfo";
import { reprobeTrackAudio } from "@/services/internalApi/tracks";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";

export default function FileSection({ track }: { track: Track }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function reprobe() {
    setPending(true);
    setError(null);
    try {
      const updated = await reprobeTrackAudio(track);
      useTrackStore.getState().setTrack(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-probe failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <Box mt={4} borderWidth="outline" borderColor="border.ink" boxShadow="sm" borderRadius="md">
      <Flex p={4} pb={0} justify="space-between" align="center" gap={3}>
        <SectionHeading>File</SectionHeading>
        <Button
          size="sm"
          minH="44px"
          disabled={!track.local_audio_url}
          loading={pending}
          onClick={reprobe}
        >
          Re-probe
        </Button>
      </Flex>
      {error && (
        <Text role="alert" color="fg.error" px={4} mt={3}>
          {error}
        </Text>
      )}
      <FileInfoDetails track={track} fullPath />
    </Box>
  );
}
