"use client";
import { useEffect, useRef } from "react";
import { Box, Text, Button, Dialog, Alert } from "@chakra-ui/react";

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
    <Dialog.Root open={discogsSyncOpen} onOpenChange={(d) => setDiscogsSyncOpen(d.open)}>
      <Dialog.Positioner>
        <Dialog.Content maxW="600px">
          <Dialog.Header>
            <Dialog.Title>Discogs Sync Progress</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
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
                <Alert.Title>Error</Alert.Title>
                <Alert.Description>{discogs.error}</Alert.Description>
              </Alert.Root>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Button onClick={() => setDiscogsSyncOpen(false)} disabled={!discogs.done}>
              Close
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
