"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { recordCareStatusSchema } from "@groovenet/contracts";
import { Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import RecordCareList from "@/components/records/RecordCareList";
import RecordCareSummary from "@/components/records/RecordCareSummary";
import { useRecordCareSummaryQuery } from "@/hooks/useRecordCareQuery";
import type { RecordCareStatus } from "@/lib/recordCare";
import { useUsername } from "@/providers/UsernameProvider";

/** Record care chores (#262): copies to clean, and copies still to re-sleeve. */
function ChorePageContent() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlStatus =
    recordCareStatusSchema.safeParse(searchParams.get("status")).data ?? "never_cleaned";
  const [status, setStatus] = React.useState<RecordCareStatus>(urlStatus);
  React.useEffect(() => setStatus(urlStatus), [urlStatus]);
  const changeStatus = (next: RecordCareStatus) => {
    setStatus(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", next);
    router.push(`/chore?${params.toString()}`);
  };
  const summaryQuery = useRecordCareSummaryQuery(
    { friend_id: friendId },
    { enabled: friendId > 0 },
  );

  if (!isHydrated || !friendId) {
    return (
      <PageContainer size="standard">
        <Flex justify="center" py={10}>
          <Spinner />
        </Flex>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="standard">
      <PageHeader title="Chores" />
      <Stack gap={4}>
        <Text color="fg.muted" fontSize="sm">
          Copies due a cleaning, and copies still to move to a new sleeve.
        </Text>

        {summaryQuery.data ? (
          <RecordCareSummary
            summary={summaryQuery.data}
            status={status}
            onStatusChange={changeStatus}
          />
        ) : summaryQuery.error ? (
          <Text color="fg.error">{summaryQuery.error.message}</Text>
        ) : (
          <Flex justify="center" py={4}>
            <Spinner size="sm" />
          </Flex>
        )}

        <RecordCareList friendId={friendId} status={status} />
      </Stack>
    </PageContainer>
  );
}

export default function ChorePage() {
  return (
    <React.Suspense fallback={null}>
      <ChorePageContent />
    </React.Suspense>
  );
}
