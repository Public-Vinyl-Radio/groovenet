"use client";

import React from "react";
import { Box, Button, Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import SectionHeader from "@/components/album-detail/SectionHeader";
import { toaster } from "@/components/ui/toaster";
import { useRecordCareMutations, useRecordCopiesQuery } from "@/hooks/useRecordCareQuery";
import type { RecordCopyListItem } from "@/services/internalApi/recordCare";
import ConfirmDialog from "./ConfirmDialog";
import RecordActionDialog from "./RecordActionDialog";
import RecordCopyCard from "./RecordCopyCard";
import RecordCopyFormDialog from "./RecordCopyFormDialog";
import { copyName } from "./recordCareFormat";

type Props = {
  releaseId: string;
  friendId: number;
  albumTitle: string;
};

type Removing = { copy: RecordCopyListItem; name: string };

/** The album page's copies, each with its care state and history (#262). */
export default function AlbumRecordCarePanel({ releaseId, friendId, albumTitle }: Props) {
  const { copies, overdueDays, isLoading, error } = useRecordCopiesQuery(
    { friend_id: friendId, release_id: releaseId },
    { enabled: !!releaseId && !!friendId }
  );
  const { removeCopy, removeCopyPending } = useRecordCareMutations(friendId);

  // `undefined` closes a dialog; the copy names its target, or the release's
  // default copy (`null`) for the header's "Log Care".
  const [logFor, setLogFor] = React.useState<RecordCopyListItem | null | undefined>();
  const [editing, setEditing] = React.useState<RecordCopyListItem | null | undefined>();
  const [removing, setRemoving] = React.useState<Removing | null>(null);

  const handleRemove = async () => {
    const { copy } = removing as Removing;
    try {
      await removeCopy(copy.id as number);
      toaster.create({ title: "Copy removed", type: "success" });
    } catch (err) {
      toaster.create({
        title: "Failed to remove copy",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
      throw err;
    }
  };

  return (
    <Stack gap={3}>
      <SectionHeader
        title="Copies & care"
        count={isLoading ? undefined : `${copies.length} ${copies.length === 1 ? "copy" : "copies"}`}
        description="Cleanings and sleeves, per physical copy."
      >
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
          Add copy
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLogFor(null)}>
          Log care
        </Button>
      </SectionHeader>

      <Box borderWidth="outline" borderColor="border.ink" boxShadow="md">
        {isLoading ? (
          <Flex justify="center" py={4}>
            <Spinner size="sm" />
          </Flex>
        ) : error ? (
          <Text fontSize="xs" color="fg.error" px={3} py={2.5}>{error.message}</Text>
        ) : (
          copies.map((copy, index) => (
            <RecordCopyCard
              key={copy.id ?? "implicit"}
              copy={copy}
              index={index}
              friendId={friendId}
              overdueDays={overdueDays}
              hasSiblings={copies.length > 1}
              onLogCare={() => setLogFor(copy)}
              onEdit={() => setEditing(copy)}
              onRemove={() => setRemoving({ copy, name: copyName(copy, index) })}
            />
          ))
        )}
      </Box>

      <RecordActionDialog
        open={logFor !== undefined}
        onOpenChange={(open) => !open && setLogFor(undefined)}
        releaseId={releaseId}
        friendId={friendId}
        albumTitle={albumTitle}
        copy={logFor ?? undefined}
      />
      <RecordCopyFormDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        releaseId={releaseId}
        friendId={friendId}
        copy={editing ?? undefined}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this copy?"
        body={
          <>
            <strong>{removing?.name}</strong> is no longer listed. Its care history is kept.
          </>
        }
        confirmLabel="Remove"
        onConfirm={handleRemove}
        pending={removeCopyPending}
      />
    </Stack>
  );
}
