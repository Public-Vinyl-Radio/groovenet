"use client";

import React from "react";
import { Box, Text, Button, Dialog, Alert, HStack, VStack, Code } from "@chakra-ui/react";

interface RemovedReleasesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  removedIds: string[];
  onDelete: () => void;
  onSkip: () => void;
  deletePending: boolean;
}

export default function RemovedReleasesDialog({
  open,
  onOpenChange,
  username,
  removedIds,
  onDelete,
  onSkip,
  deletePending,
}: RemovedReleasesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <Dialog.Positioner>
        <Dialog.Content maxW="600px">
          <Dialog.Header>
            <Dialog.Title>Removed Releases Detected</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <VStack align="stretch" gap={4}>
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Title>
                  {removedIds.length} release{removedIds.length > 1 ? "s" : ""} removed from Discogs
                </Alert.Title>
                <Alert.Description>
                  These releases are in your local manifest but no longer appear in {username}
                  &apos;s Discogs collection. They may have been deleted or removed from the
                  collection.
                </Alert.Description>
              </Alert.Root>

              <Box>
                <Text fontWeight="medium" mb={2}>
                  Removed Release IDs:
                </Text>
                <Box maxH="300px" overflowY="auto" bg="bg.muted" p={3} borderRadius="md">
                  <VStack align="stretch" gap={1}>
                    {removedIds.map((releaseId) => (
                      <Code key={releaseId} fontSize="sm">
                        {releaseId}
                      </Code>
                    ))}
                  </VStack>
                </Box>
              </Box>

              <Box>
                <Text fontSize="sm" color="fg.muted">
                  <strong>Deleting will:</strong>
                </Text>
                <VStack align="stretch" gap={0.5} pl={4} mt={1}>
                  <Text fontSize="sm" color="fg.muted">
                    • Remove local JSON files
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    • Move IDs to &quot;deletedReleaseIds&quot; in manifest
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    • Delete all tracks from PostgreSQL database
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    • Remove tracks from search results
                  </Text>
                </VStack>
              </Box>
            </VStack>
          </Dialog.Body>
          <Dialog.Footer>
            <HStack justify="space-between" width="100%">
              <Button variant="outline" onClick={onSkip} disabled={deletePending}>
                Keep Files
              </Button>
              <Button
                colorPalette="danger"
                onClick={onDelete}
                loading={deletePending}
                disabled={deletePending}
              >
                Delete {removedIds.length} Release
                {removedIds.length > 1 ? "s" : ""}
              </Button>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
