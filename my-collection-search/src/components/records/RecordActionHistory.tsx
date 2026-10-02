"use client";

import React from "react";
import { Button, Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useRecordActionsQuery, useRecordCareMutations } from "@/hooks/useRecordCareQuery";
import type { RecordAction } from "@/services/internalApi/recordCare";
import ConfirmDialog from "./ConfirmDialog";
import { describeAction } from "./recordCareFormat";

type Props = {
  copyId: number;
  friendId: number;
};

/** A copy's care history, newest first, each entry voidable if it was a mistake. */
export default function RecordActionHistory({ copyId, friendId }: Props) {
  const { actions, isLoading, error } = useRecordActionsQuery(copyId, { friend_id: friendId });
  const { voidAction, voidActionPending } = useRecordCareMutations(friendId);
  const [voiding, setVoiding] = React.useState<RecordAction | null>(null);

  const handleVoid = async () => {
    try {
      await voidAction((voiding as RecordAction).id);
      toaster.create({ title: "Action voided", type: "success" });
    } catch (err) {
      toaster.create({
        title: "Failed to void action",
        description: err instanceof Error ? err.message : "Unknown error",
        type: "error",
      });
      throw err;
    }
  };

  if (isLoading) {
    return (
      <Flex justify="center" py={3}>
        <Spinner size="sm" />
      </Flex>
    );
  }
  if (error) return <Text fontSize="xs" color="fg.error">{error.message}</Text>;
  if (actions.length === 0) {
    return <Text fontSize="xs" color="fg.muted">No care logged yet</Text>;
  }

  return (
    <>
      <Stack gap={1.5} as="ul" listStyleType="none">
        {actions.map((action) => (
          <Flex as="li" key={action.id} align="start" gap={3} fontSize="xs">
            <Text color="fg.muted" minW="5.5rem">
              {new Date(action.occurred_at).toLocaleDateString()}
            </Text>
            <Stack gap={0} flex={1} minW={0}>
              <Text fontWeight="medium">{describeAction(action)}</Text>
              {action.notes && <Text color="fg.muted" whiteSpace="pre-wrap">{action.notes}</Text>}
            </Stack>
            <Button
              size="2xs"
              variant="ghost"
              aria-label={`Void ${describeAction(action)}`}
              onClick={() => setVoiding(action)}
            >
              Void
            </Button>
          </Flex>
        ))}
      </Stack>
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Void this action?"
        body={
          <>
            <strong>{voiding ? describeAction(voiding) : ""}</strong> stays in the history but no
            longer counts toward this copy&apos;s care state.
          </>
        }
        confirmLabel="Void"
        onConfirm={handleVoid}
        pending={voidActionPending}
      />
    </>
  );
}
