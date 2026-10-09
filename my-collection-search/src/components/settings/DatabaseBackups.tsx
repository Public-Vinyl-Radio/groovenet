import { useState } from "react";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Heading,
  IconButton,
  Portal,
  Text,
  VStack,
  HStack,
  Skeleton,
} from "@chakra-ui/react";
import { FiDownload, FiTrash2 } from "react-icons/fi";
import { useBackupsQuery } from "@/hooks/useBackupsQuery";
import { formatBytes } from "@/components/settings/BackupStatusSection";
import { toaster } from "@/components/ui/toaster";

export default function DatabaseBackups() {
  const { backups, backupsLoading, removeBackup } = useBackupsQuery();
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const confirmDelete = () => {
    // The dialog, and so this button, only exists while a delete is pending.
    const filename = pendingDelete!;
    removeBackup.mutate(filename, {
      onSuccess: () =>
        toaster.create({ title: "Backup deleted", type: "success", description: filename }),
      onError: (e) =>
        toaster.create({ title: "Delete failed", type: "error", description: e.message }),
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <Box mt={{ base: 6, md: 10 }} mb={8} p={4} borderWidth={1} borderRadius="md">
      <Heading size="md" mb={2}>
        Database Backups
      </Heading>
      {backupsLoading ? (
        <VStack align="stretch" gap={3}>
          {[...Array(5)].map((_, i) => (
            <HStack key={i} justify="space-between">
              <Skeleton height="20px" width="60%" />
              <Skeleton height="28px" width="40px" />
            </HStack>
          ))}
        </VStack>
      ) : backups.length === 0 ? (
        <Text>No backups found in the directory.</Text>
      ) : (
        <>
          <VStack align="stretch" gap={3}>
            {(showAllBackups ? backups : backups.slice(0, 5)).map((backup) => (
              <HStack key={backup.filename} justify="space-between" align="center">
                <Box pr={3} minW={0}>
                  <Text fontSize="sm" lineClamp={2}>
                    {backup.filename}
                  </Text>
                  <Text fontSize="xs" color="fg.muted">
                    {formatBytes(backup.size_bytes)} ·{" "}
                    {new Date(backup.modified_at).toLocaleString()}
                  </Text>
                </Box>
                <HStack gap={2} flexShrink={0}>
                  <a
                    href={`/api/backups/${encodeURIComponent(backup.filename)}`}
                    download
                    style={{ textDecoration: "none" }}
                  >
                    <Button colorPalette="blue" size="xs" aria-label={`Download ${backup.filename}`}>
                      <FiDownload />
                    </Button>
                  </a>
                  <IconButton
                    size="xs"
                    variant="outline"
                    colorPalette="red"
                    aria-label={`Delete ${backup.filename}`}
                    onClick={() => setPendingDelete(backup.filename)}
                  >
                    <FiTrash2 />
                  </IconButton>
                </HStack>
              </HStack>
            ))}
          </VStack>
          {backups.length > 5 && (
            <Button
              mt={3}
              size="sm"
              variant="ghost"
              colorPalette="blue"
              onClick={() => setShowAllBackups((v) => !v)}
              alignSelf="flex-start"
            >
              {showAllBackups ? "Show Less" : `Show All (${backups.length})`}
            </Button>
          )}
        </>
      )}

      <Dialog.Root
        open={pendingDelete !== null}
        onOpenChange={(details) => {
          if (!details.open) setPendingDelete(null);
        }}
        role="alertdialog"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Delete Backup</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </Dialog.CloseTrigger>
              </Dialog.Header>
              <Dialog.Body>
                <Text>
                  Delete <strong>{pendingDelete}</strong>? This cannot be undone.
                </Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  colorPalette="red"
                  onClick={confirmDelete}
                  loading={removeBackup.isPending}
                  disabled={removeBackup.isPending}
                >
                  Delete
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}
