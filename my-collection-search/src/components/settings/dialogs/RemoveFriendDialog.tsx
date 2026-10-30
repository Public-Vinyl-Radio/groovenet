// components/settings/dialogs/RemoveFriendDialog.tsx
"use client";

import RetroDialog from "@/components/ui/RetroDialog";

import { useEffect, useRef } from "react";
import { Box, Text, Button, Alert, Flex } from "@chakra-ui/react";

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
    <RetroDialog
      open={removeFriendOpen}
      onOpenChange={setRemoveFriendOpen}
      title="Remove Friend Progress"
      maxW="600px"

      footer={
        <Flex p={4} gap={2} flexWrap="wrap" justify="flex-end">
          <Button
            minH="44px"
            onClick={() => setRemoveFriendOpen(false)}
            disabled={!removeFriend.done}
          >
            Close
          </Button>
        </Flex>
      }
    >
      <Box p={4} minW={0}>
        <Box
          ref={scrollerRef}
          maxH="350px"
          overflowY="auto"
          bg="bg.subtle"
          p={2}
          borderRadius="md"
          fontFamily="mono"
          fontSize="sm"
        >
          {removeFriend.lines.length === 0 && (
            <Text color="fg.muted">Waiting for removal output...</Text>
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
            <Alert.Content>
              <Alert.Title>Error</Alert.Title>
              <Alert.Description>{removeFriend.error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Box>
    </RetroDialog>
  );
}
