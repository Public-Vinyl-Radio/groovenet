"use client";

import RetroDialog from "@/components/ui/RetroDialog";
import { useEffect, useRef } from "react";
import { Box, Text, Button, Alert, Flex } from "@chakra-ui/react";

import { useSettingsDialogs } from "@/providers/SettingsDialogProvider";
import { useSyncStreams } from "@/providers/SyncStreamsProvider";

export default function DiscogsSyncDialog() {
  const { discogsSyncOpen, setDiscogsSyncOpen } = useSettingsDialogs();
  const { discogs } = useSyncStreams();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Always scroll to bottom when new lines arrive
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [discogs.lines.length]);

  return (
    <RetroDialog
      open={discogsSyncOpen}
      onOpenChange={setDiscogsSyncOpen}
      title="Discogs Sync Progress"
      maxW="600px"

      footer={
        <Flex p={4} gap={2} flexWrap="wrap" justify="flex-end">
          <Button minH="44px" onClick={() => setDiscogsSyncOpen(false)} disabled={!discogs.done}>
            Close
          </Button>
        </Flex>
      }
    >
      <Box p={4} minW={0}>
        <Box
          ref={scrollRef}
          maxH="350px"
          overflowY="auto"
          bg="bg.muted"
          p={2}
          borderRadius="md"
          fontFamily="mono"
          fontSize="sm"
        >
          {discogs.lines.length === 0 && <Text color="text">Waiting for sync output...</Text>}
          {discogs.lines.map((line: string, i: number) => (
            <Text key={i} whiteSpace="pre-wrap">
              {line}
            </Text>
          ))}
        </Box>
        {discogs.error && (
          <Alert.Root status="error" mt={3}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Error</Alert.Title>
              <Alert.Description>{discogs.error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Box>
    </RetroDialog>
  );
}
