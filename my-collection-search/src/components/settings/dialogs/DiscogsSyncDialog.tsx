"use client";

import RetroDialog from "@/components/ui/RetroDialog";
import { useEffect, useRef } from "react";
import { Box, Text, Button, Alert, Flex } from "@chakra-ui/react";

import { isDiscogsImportActive } from "@groovenet/contracts";
import { useDiscogsImportLog, useDiscogsImportsQuery } from "@/hooks/useDiscogsImports";
import { useSettingsDialogs } from "@/providers/SettingsDialogProvider";

/**
 * The progress lines of one Discogs import (#1274), the same text `GET /api/discogs` streams,
 * read from the import's log, so it can be closed and reopened and the import carries on.
 */
export default function DiscogsSyncDialog() {
  const { discogsSyncOpen, setDiscogsSyncOpen, discogsSyncImportId } = useSettingsDialogs();
  const imports = useDiscogsImportsQuery();
  const job = imports.data?.imports.find((other) => other.id === discogsSyncImportId) ?? null;
  // Until the list has it, an import just queued is still running.
  const active =
    discogsSyncImportId !== null && (job === null || isDiscogsImportActive(job.status));
  const discogs = useDiscogsImportLog(discogsSyncOpen ? discogsSyncImportId : null, active);
  const error = job?.status === "failed" || job?.status === "interrupted" ? job.last_error : null;
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
          {active && (
            <Text color="fg.muted" mr="auto" alignSelf="center">
              Runs in the background: you can close this.
            </Text>
          )}
          <Button minH="44px" onClick={() => setDiscogsSyncOpen(false)}>
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
        {(error || discogs.error) && (
          <Alert.Root status="error" mt={3}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Error</Alert.Title>
              <Alert.Description>{error ?? discogs.error}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Box>
    </RetroDialog>
  );
}
