"use client";

import RetroDialog from "@/components/ui/RetroDialog";

import React from "react";
import { Flex, Box, Text, Button, Alert, VStack, Code } from "@chakra-ui/react";

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
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Removed Releases Detected"
      maxW="600px"
      dismissible={!deletePending}
      footer={
        <Flex p={4} gap={2} flexWrap="wrap" justify="flex-end">
          <Flex
            direction={{ base: "column", sm: "row" }}
            gap={2}
            justify="space-between"
            width="100%"
          >
            <Button minH="44px" variant="outline" onClick={onSkip} disabled={deletePending}>
              Keep Files
            </Button>
            <Button
              minH="44px"
              colorPalette="danger"
              onClick={onDelete}
              loading={deletePending}
              disabled={deletePending}
            >
              Delete {removedIds.length} Release
              {removedIds.length > 1 ? "s" : ""}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Box p={4} minW={0}>
        <VStack align="stretch" gap={4}>
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {removedIds.length} release{removedIds.length > 1 ? "s" : ""} removed from Discogs
              </Alert.Title>
              <Alert.Description>
                These releases are in your local manifest but no longer appear in {username}&apos;s
                Discogs collection. They may have been deleted or removed from the collection.
              </Alert.Description>
            </Alert.Content>
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
      </Box>
    </RetroDialog>
  );
}
