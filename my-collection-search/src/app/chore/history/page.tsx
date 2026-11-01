"use client";

import React from "react";
import { Button, Flex, Spinner, Stack, Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import { CareLogEntryCard, careLogEntryKey } from "@/components/chores/ChoresCareLog";
import { careLogHeadline, undoErrorText } from "@/components/chores/careLog";
import ConfirmDialog from "@/components/records/ConfirmDialog";
import {
  useRecordCareLogQuery,
  useRecordCareMutations,
  useRecordCareSessionMutations,
} from "@/hooks/useRecordCareQuery";
import { useDisplayTimeZone } from "@/providers/DisplayTimeZoneProvider";
import { useUsername } from "@/providers/UsernameProvider";
import type { RecordCareLogEntry } from "@/services/internalApi/recordCare";

// Entries per "more"; the feed asks for a longer page each time.
const HISTORY_PAGE = 20;

/**
 * The full care history (#944): every log, newest first, with undone ones
 * struck through. Older logs are voided here; the Chores column only undoes
 * the one just saved.
 */
export default function CareHistoryPage() {
  const { friend, isHydrated } = useUsername();
  const friendId = friend?.id ?? 0;
  const enabled = isHydrated && friendId > 0;
  const timeZone = useDisplayTimeZone();
  const [limit, setLimit] = React.useState(HISTORY_PAGE);
  const logQuery = useRecordCareLogQuery({ friend_id: friendId, limit }, { enabled });
  const { voidSession, voidPending } = useRecordCareSessionMutations(friendId);
  const { voidAction, voidActionPending } = useRecordCareMutations(friendId);
  const [confirming, setConfirming] = React.useState<RecordCareLogEntry | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // A failure is shown in the entry, so the prompt closes either way.
  const voidEntry = async (entry: RecordCareLogEntry) => {
    const key = careLogEntryKey(entry);
    setErrors(({ [key]: _, ...rest }) => rest);
    try {
      if (entry.kind === "session") await voidSession(entry.session_id as number);
      else await voidAction(entry.action_id as number);
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: undoErrorText(error) }));
    }
  };

  const header = (
    <PageHeader
      title="Care history"
      breadcrumbs={[{ label: "Chores", href: "/chore" }, { label: "Care history" }]}
    />
  );

  let body: React.ReactNode;
  if (!enabled || (!logQuery.data && !logQuery.error)) {
    body = (
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>
    );
  } else if (logQuery.error) {
    body = (
      <Text role="alert" fontFamily="mono" fontSize="11px" letterSpacing="0.08em" color="fg.muted">
        COULDN&apos;T LOAD THE CARE HISTORY · {logQuery.error.message.toUpperCase()}
      </Text>
    );
  } else {
    const { items, total } = logQuery.data!;
    body = (
      <Stack gap="14px" maxW="640px" pr="6px" pb={6}>
        <Text fontFamily="mono" fontSize="11px" letterSpacing="0.06em" color="fg.muted">
          {total.toLocaleString("en-US")} {total === 1 ? "ENTRY" : "ENTRIES"}
        </Text>
        {items.length === 0 && (
          <Text fontSize="15px" color="fg.muted">
            Nothing logged yet.
          </Text>
        )}
        {items.map((entry) => {
          const key = careLogEntryKey(entry);
          return (
            <CareLogEntryCard
              key={key}
              entry={entry}
              timeZone={timeZone}
              action={
                entry.voided
                  ? undefined
                  : { label: "VOID", onClick: () => setConfirming(entry), error: errors[key] }
              }
            />
          );
        })}
        {items.length < total && (
          <Button
            variant="outline"
            h="44px"
            loading={logQuery.isPlaceholderData}
            onClick={() => setLimit((current) => current + HISTORY_PAGE)}
          >
            {(total - items.length).toLocaleString("en-US")} MORE →
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <PageContainer size="narrow">
      {header}
      {body}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Void this log?"
          body={`${careLogHeadline(confirming)}. It stays in the history, struck through, and stops counting.`}
          confirmLabel="VOID"
          pending={voidPending || voidActionPending}
          onConfirm={() => voidEntry(confirming)}
        />
      )}
    </PageContainer>
  );
}
