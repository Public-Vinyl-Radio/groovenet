"use client";

import React from "react";
import { Box, Button, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { MetaTag, StatusTag } from "@/components/ui/RoleTags";
import type { RecordCopyListItem } from "@/services/internalApi/recordCare";
import RecordActionHistory from "./RecordActionHistory";
import RecordCopyMenu from "./RecordCopyMenu";
import { cleaningState, copyName, formatLastCleaned, sleeveLabel } from "./recordCareFormat";

type Props = {
  copy: RecordCopyListItem;
  index: number;
  friendId: number;
  overdueDays?: number;
  /** Whether the release has other copies, which is when "Default" says something. */
  hasSiblings: boolean;
  onLogCare: () => void;
  onEdit: () => void;
  onRemove: () => void;
};

/** One physical copy: its care state at a glance, its actions, and its history. */
export default function RecordCopyCard({
  copy,
  index,
  friendId,
  overdueDays,
  hasSiblings,
  onLogCare,
  onEdit,
  onRemove,
}: Props) {
  const [showHistory, setShowHistory] = React.useState(false);
  const name = copyName(copy, index);
  const state = cleaningState(copy.last_cleaned_at, overdueDays);

  return (
    <Box role="group" aria-label={name} px={3} py={2.5} borderTopWidth={index === 0 ? 0 : "1px"}>
      <Flex align="start" gap={3}>
        <Stack gap={1} flex={1} minW={0}>
          <HStack gap={2} wrap="wrap">
            <Text fontWeight="semibold" fontSize="sm">
              {name}
            </Text>
            {copy.is_default && hasSiblings && <MetaTag size="sm">Default</MetaTag>}
            {copy.inner_sleeve_type ? (
              <MetaTag size="sm">{sleeveLabel(copy.inner_sleeve_type)}</MetaTag>
            ) : (
              <StatusTag tone="neutral" size="sm">
                Sleeve unknown
              </StatusTag>
            )}
            {state === "never_cleaned" && (
              <StatusTag tone="missing" size="sm">
                Never cleaned
              </StatusTag>
            )}
            {state === "overdue" && (
              <StatusTag tone="missing" size="sm">
                Overdue
              </StatusTag>
            )}
          </HStack>
          {state !== "never_cleaned" && (
            <Text fontSize="xs" color="fg.muted">
              {formatLastCleaned(copy.last_cleaned_at)}
            </Text>
          )}
          {copy.notes && (
            <Text fontSize="xs" color="fg.muted" whiteSpace="pre-wrap">
              {copy.notes}
            </Text>
          )}
        </Stack>
        {/* An implicit copy has no actions yet, so nothing to show. */}
        {copy.id !== null && (
          <Button
            size="xs"
            variant="ghost"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            History
          </Button>
        )}
        <RecordCopyMenu
          label={name}
          onLogCare={onLogCare}
          onEdit={onEdit}
          onRemove={copy.is_default ? undefined : onRemove}
        />
      </Flex>
      {showHistory && copy.id !== null && (
        <Box mt={2} pl={1}>
          <RecordActionHistory copyId={copy.id} friendId={friendId} />
        </Box>
      )}
    </Box>
  );
}
