"use client";

import React from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Button,
  EmptyState,
  Flex,
  HStack,
  Image,
  Link,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { FiCheckCircle } from "react-icons/fi";
import { useRecordCareQuery } from "@/hooks/useRecordCareQuery";
import type { RecordCareStatus } from "@/lib/recordCare";
import type { RecordCareItem } from "@/services/internalApi/recordCare";
import RecordActionDialog from "./RecordActionDialog";
import { formatLastCleaned, sleeveLabel } from "./recordCareFormat";

const CARE_PAGE_SIZE = 50;

type Props = {
  friendId: number;
  status: RecordCareStatus;
};

const EMPTY_MESSAGES: Record<RecordCareStatus, string> = {
  never_cleaned: "Every copy has been cleaned at least once.",
  overdue: "No copy is overdue for a cleaning.",
  needs_sleeve: "Every copy is in the target sleeve.",
};

/** One page of copies needing the chosen chore, each with the action that clears it. */
export default function RecordCareList({ friendId, status }: Props) {
  const [offset, setOffset] = React.useState(0);
  const [shownStatus, setShownStatus] = React.useState(status);
  if (status !== shownStatus) {
    setShownStatus(status);
    setOffset(0);
  }
  const [logging, setLogging] = React.useState<RecordCareItem | null>(null);

  const { items, data, isLoading, error } = useRecordCareQuery({
    friend_id: friendId,
    status,
    limit: CARE_PAGE_SIZE,
    offset,
  });
  const total = data?.total ?? 0;
  const actionType = status === "needs_sleeve" ? "sleeved" : "cleaned";

  if (isLoading) {
    return (
      <Flex justify="center" py={8}>
        <Spinner />
      </Flex>
    );
  }
  if (error) return <Text color="fg.error">{error.message}</Text>;
  if (items.length === 0) {
    return (
      <EmptyState.Root size="sm">
        <EmptyState.Content>
          <EmptyState.Indicator>
            <FiCheckCircle />
          </EmptyState.Indicator>
          <EmptyState.Description>{EMPTY_MESSAGES[status]}</EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <Stack gap={3}>
      <Box borderWidth="1px" borderRadius="md" as="ul" listStyleType="none">
        {items.map((item, index) => (
          <Flex
            as="li"
            key={`${item.release_id}:${item.copy_id ?? "implicit"}`}
            align="center"
            gap={3}
            px={3}
            py={2.5}
            borderTopWidth={index === 0 ? 0 : "1px"}
          >
            <Image
              src={item.album_thumbnail || "/images/placeholder-artwork.png"}
              alt=""
              boxSize="40px"
              objectFit="cover"
              borderRadius="sm"
              flexShrink={0}
            />
            <Stack gap={0.5} flex={1} minW={0}>
              {/* Clamp the Text, not the Link: a clamped Link stretches and centres its title. */}
              <Text fontSize="sm" fontWeight="semibold" lineClamp={1}>
                <Link
                  as={NextLink}
                  href={`/albums/${encodeURIComponent(item.release_id)}?friend_id=${item.friend_id}`}
                >
                  {item.album_title}
                </Link>
              </Text>
              <Text fontSize="xs" color="fg.muted" lineClamp={1}>{item.album_artist}</Text>
              <HStack gap={1.5} wrap="wrap">
                {item.label && <Badge size="sm" variant="outline">{item.label}</Badge>}
                <Badge size="sm" variant="surface">{sleeveLabel(item.inner_sleeve_type)}</Badge>
                <Text fontSize="xs" color="fg.muted">{formatLastCleaned(item.last_cleaned_at)}</Text>
              </HStack>
            </Stack>
            <Button
              size="xs"
              variant="outline"
              flexShrink={0}
              aria-label={`${actionType === "sleeved" ? "Log sleeve change" : "Log cleaning"} for ${item.album_title}`}
              onClick={() => setLogging(item)}
            >
              {actionType === "sleeved" ? "Log sleeve" : "Log cleaning"}
            </Button>
          </Flex>
        ))}
      </Box>

      <Flex justify="space-between" align="center" gap={3}>
        <Text fontSize="xs" color="fg.muted">
          {offset + 1}–{offset + items.length} of {total}
        </Text>
        <HStack gap={2}>
          <Button
            size="xs"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - CARE_PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={offset + items.length >= total}
            onClick={() => setOffset(offset + CARE_PAGE_SIZE)}
          >
            Next
          </Button>
        </HStack>
      </Flex>

      {logging && (
        <RecordActionDialog
          open
          onOpenChange={(open) => !open && setLogging(null)}
          releaseId={logging.release_id}
          friendId={friendId}
          albumTitle={logging.album_title}
          copy={{ id: logging.copy_id, is_default: logging.is_default }}
          actionType={actionType}
        />
      )}
    </Stack>
  );
}
