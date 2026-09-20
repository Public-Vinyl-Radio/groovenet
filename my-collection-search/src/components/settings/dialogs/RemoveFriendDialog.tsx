// components/settings/dialogs/RemoveFriendDialog.tsx
"use client";

import { useEffect, useRef } from "react";
import {
  Box,
  Text,
  Button,
  Dialog,
  Alert,
  CloseButton,
} from "@chakra-ui/react";

import { useSettingsDialogs } from "@/providers/SettingsDialogProvider";
import { useSyncStreams } from "@/providers/SyncStreamsProvider";

export default function RemoveFriendDialog() {
  const { removeFriendOpen, setRemoveFriendOpen } = useSettingsDialogs();
  const { removeFriend } = useSyncStreams(); // { lines, done, error }
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new lines stream in
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [removeFriend.lines.length]);

  return (
    <Dialog.Root
      open={removeFriendOpen}
      onOpenChange={(d) => setRemoveFriendOpen(d.open)}
    >
      <Dialog.Positioner>
        <Dialog.Content maxW="600px">
          <Dialog.Header>
            <Dialog.Title>Remove Friend Progress</Dialog.Title>
          </Dialog.Header>

          <Dialog.Body>
            <Box
              ref={scrollerRef}
              maxH="350px"
              overflowY="auto"
              bg="gray.50"
              p={2}
              borderRadius="md"
              fontFamily="mono"
              fontSize="sm"
            >
              {removeFriend.lines.length === 0 && (
                <Text color="gray.400">Waiting for removal output...</Text>
              )}
              {removeFriend.lines.map((line, i) => (
                <Text key={i} whiteSpace="pre-wrap">
                  {line}
                </Text>
              ))}
            </Box>

            {removeFriend.error && (
              <Alert.Root status="error" mt={3}>
                <Alert.Indicator />
                <Alert.Title>Error</Alert.Title>
                <Alert.Description>{removeFriend.error}</Alert.Description>
              </Alert.Root>
            )}
          </Dialog.Body>

          <Dialog.Footer>
            <Button
              onClick={() => setRemoveFriendOpen(false)}
              disabled={!removeFriend.done}
            >
              Close
            </Button>
          </Dialog.Footer>

          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" />
          </Dialog.CloseTrigger>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
