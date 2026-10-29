"use client";

import React from "react";
import { Box, Text, Button, Dialog, Alert, HStack, VStack, Accordion } from "@chakra-ui/react";
import type { VerificationResult } from "@/services/internalApi/discogs";

interface ManifestVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: VerificationResult[];
  onCleanup: () => void;
  onContinue: () => void;
  cleanupPending: boolean;
}

export default function ManifestVerificationDialog({
  open,
  onOpenChange,
  results,
  onCleanup,
  onContinue,
  cleanupPending,
}: ManifestVerificationDialogProps) {
  const totalMissing = results.reduce((sum, r) => sum + r.missingFiles.length, 0);
  const hasMissingFiles = totalMissing > 0;

  return (
    <Dialog.Root open={open} onOpenChange={(d) => onOpenChange(d.open)}>
      <Dialog.Positioner>
        <Dialog.Content maxW="600px">
          <Dialog.Header>
            <Dialog.Title>Manifest Verification</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            {!hasMissingFiles ? (
              <Alert.Root status="success">
                <Alert.Indicator />
                <Alert.Title>All files verified</Alert.Title>
                <Alert.Description>
                  All release files in the manifest exist on disk. You can proceed with the sync.
                </Alert.Description>
              </Alert.Root>
            ) : (
              <VStack align="stretch" gap={4}>
                <Alert.Root status="warning">
                  <Alert.Indicator />
                  <Alert.Title>Missing files detected</Alert.Title>
                  <Alert.Description>
                    Found {totalMissing} release ID(s) in the manifest that don&apos;t have
                    corresponding JSON files on disk.
                  </Alert.Description>
                </Alert.Root>

                <Box maxH="300px" overflowY="auto" bg="bg.muted" p={3} borderRadius="md">
                  <Accordion.Root collapsible multiple>
                    {results
                      .filter((r) => r.missingFiles.length > 0)
                      .map((result, idx) => (
                        <Accordion.Item key={result.username} value={String(idx)}>
                          <Accordion.ItemTrigger>
                            <HStack justify="space-between" width="100%">
                              <Text fontWeight="medium">{result.username}</Text>
                              <Text fontSize="sm" color="fg.muted">
                                {result.missingFiles.length} missing
                              </Text>
                            </HStack>
                          </Accordion.ItemTrigger>
                          <Accordion.ItemContent>
                            <VStack align="stretch" gap={1} pl={4}>
                              {result.missingFiles.map((fileId) => (
                                <Text key={fileId} fontSize="sm" fontFamily="mono">
                                  {fileId}
                                </Text>
                              ))}
                            </VStack>
                          </Accordion.ItemContent>
                        </Accordion.Item>
                      ))}
                  </Accordion.Root>
                </Box>

                <Text fontSize="sm" color="fg.muted">
                  These entries will be skipped during the sync process. You can clean them up now
                  to keep your manifest tidy, or continue with the sync as-is.
                </Text>
              </VStack>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <HStack justify="space-between" width="100%">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={cleanupPending}
              >
                Cancel
              </Button>
              <HStack>
                {hasMissingFiles && (
                  <Button
                    colorPalette="status.analysis"
                    onClick={onCleanup}
                    loading={cleanupPending}
                    disabled={cleanupPending}
                  >
                    Clean Up Manifest
                  </Button>
                )}
                <Button colorPalette="accent" onClick={onContinue} disabled={cleanupPending}>
                  {hasMissingFiles ? "Continue Anyway" : "Proceed with Sync"}
                </Button>
              </HStack>
            </HStack>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
