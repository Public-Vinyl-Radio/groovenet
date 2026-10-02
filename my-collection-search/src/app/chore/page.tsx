"use client";

import React from "react";
import { Box, Flex, Heading, Spinner, Stack, Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import RecordCareList from "@/components/records/RecordCareList";
import RecordCareSummary from "@/components/records/RecordCareSummary";
import { useRecordCareSummaryQuery } from "@/hooks/useRecordCareQuery";
import type { RecordCareStatus } from "@/lib/recordCare";
import { useUsername } from "@/providers/UsernameProvider";

/** Record care chores (#262): copies to clean, and copies still to re-sleeve. */
export default function ChorePage() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const [status, setStatus] = React.useState<RecordCareStatus>("never_cleaned");
  const summaryQuery = useRecordCareSummaryQuery({ friend_id: friendId }, { enabled: friendId > 0 });

  if (!isHydrated || !friendId) {
    return (
      <PageContainer size="standard">
        <Flex justify="center" py={10}><Spinner /></Flex>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="standard">
      <Stack gap={4}>
        <Box>
          <Heading size={{ base: "md", md: "lg" }}>Chores</Heading>
          <Text color="fg.muted" fontSize="sm">
            Copies due a cleaning, and copies still to move to a new sleeve.
          </Text>
        </Box>

        {summaryQuery.data ? (
          <RecordCareSummary summary={summaryQuery.data} status={status} onStatusChange={setStatus} />
        ) : summaryQuery.error ? (
          <Text color="fg.error">{summaryQuery.error.message}</Text>
        ) : (
          <Flex justify="center" py={4}><Spinner size="sm" /></Flex>
        )}

        <RecordCareList friendId={friendId} status={status} />
      </Stack>
    </PageContainer>
  );
}
