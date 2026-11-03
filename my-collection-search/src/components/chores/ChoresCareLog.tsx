"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, chakra, Flex, Grid, Spinner, Stack, Text } from "@chakra-ui/react";
import Artwork from "@/components/player/Artwork";
import { SectionHeading } from "@/components/spins/recapParts";
import { cleaningMethodLabel, sleeveLabel } from "@/components/records/recordCareFormat";
import type {
  RecordCareLogEntry,
  RecordCareProgressResponse,
} from "@/services/internalApi/recordCare";
import { SourceTag, StatusTag } from "@/components/ui/RoleTags";
import { careLogHeadline, careLogWhen, careSourceBadge } from "./careLog";

const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "S"}`;

/** "THIS MONTH · 11 RECORDS · 2 SESSIONS". */
export function thisMonthLine(thisMonth: NonNullable<RecordCareProgressResponse["this_month"]>) {
  return `THIS MONTH · ${plural(thisMonth.records, "RECORD")} · ${plural(thisMonth.sessions, "SESSION")}`;
}

/** An entry's identity: its session, or the action logged on its own. */
export function careLogEntryKey(
  entry: Pick<RecordCareLogEntry, "kind" | "session_id" | "action_id">,
) {
  return entry.kind === "session" ? `session:${entry.session_id}` : `action:${entry.action_id}`;
}

const HeaderButton = chakra("button");

const mono = { fontFamily: "mono", letterSpacing: "0.08em" } as const;

function Notice({ role, children }: { role?: "alert"; children: React.ReactNode }) {
  return (
    <Flex
      role={role}
      minH="72px"
      align="center"
      justify="center"
      px={4}
      borderWidth="outline"
      borderRadius="md"
      borderStyle="dashed"
      borderColor="border"
      fontFamily="mono"
      fontSize="11px"
      letterSpacing="0.08em"
      color="fg.muted"
      textAlign="center"
    >
      {children}
    </Flex>
  );
}

type EntryAction = {
  /** "UNDO" for the log just saved, "VOID" in the full history. */
  label: string;
  onClick: () => void;
  pending?: boolean;
  /** Why the last attempt failed, shown inside the entry. */
  error?: string | null;
};

/**
 * One care log entry (#944): an outlined card with the time and a source
 * badge in its header, then the headline, covers, method and note. The log
 * just saved inverts its header and carries UNDO; a voided one is struck
 * through.
 */
export function CareLogEntryCard({
  entry,
  timeZone,
  action,
  justSaved = false,
  now,
}: {
  entry: RecordCareLogEntry;
  timeZone: string;
  action?: EntryAction;
  justSaved?: boolean;
  now?: Date;
}) {
  const badge = careSourceBadge(entry.source);
  const inverted = justSaved && !entry.voided;
  const headline = careLogHeadline(entry);
  const showMethod = entry.action_types.includes("cleaned");
  return (
    <Box
      as="article"
      aria-label={entry.voided ? `${headline}, voided` : headline}
      borderWidth="outline"
      borderRadius="md"
      borderColor="border.ink"
      boxShadow="md"
      bg="bg"
    >
      <Flex
        as="header"
        h="36px"
        pl={3}
        pr={1}
        align="center"
        gap={2}
        borderBottomWidth="outline"
        borderColor="border.ink"
        bg={inverted ? "fg" : "bg.subtle"}
        color={inverted ? "bg" : "fg"}
        {...mono}
        fontSize="11px"
      >
        <Text as="span" flex="1" minW={0} fontWeight="semibold" truncate>
          {careLogWhen(entry.occurred_at, timeZone, now)}
        </Text>
        {entry.voided && (
          <StatusTag tone="neutral" flexShrink={0}>
            Voided
          </StatusTag>
        )}
        <SourceTag
          data-testid="care-log-source"
          data-border={badge.borderStyle}
          stroke={badge.borderStyle}
          inverted={inverted}
          flexShrink={0}
        >
          {badge.label}
        </SourceTag>
        {action && (
          <HeaderButton
            type="button"
            onClick={action.onClick}
            disabled={action.pending}
            aria-label={`${action.label} ${headline}`}
            h="32px"
            px="10px"
            flexShrink={0}
            borderWidth="outline"
            borderRadius="md"
            borderColor="currentColor"
            bg="transparent"
            color="inherit"
            {...mono}
            letterSpacing="0.06em"
            fontSize="11px"
            fontWeight="semibold"
            cursor="pointer"
            _disabled={{ opacity: 0.6, cursor: "progress" }}
            _hover={{ opacity: 0.8 }}
          >
            {action.pending ? <Spinner size="xs" /> : action.label}
          </HeaderButton>
        )}
      </Flex>
      <Stack p={3} gap="10px" color={entry.voided ? "fg.muted" : "fg"}>
        <Text
          as="span"
          fontFamily="mono"
          fontSize="13px"
          fontWeight="semibold"
          letterSpacing="0.04em"
          textDecoration={entry.voided ? "line-through" : undefined}
        >
          {headline}
        </Text>
        {entry.thumbnails.length > 0 && (
          <Grid aria-hidden="true" templateColumns="repeat(10, minmax(0, 1fr))" gap={1}>
            {entry.thumbnails.map((src, i) => (
              <Box key={`${src}-${i}`} minW={0} opacity={entry.voided ? 0.5 : 1}>
                <Artwork src={src} alt="" fill />
              </Box>
            ))}
          </Grid>
        )}
        {(showMethod || entry.sleeve_type || entry.notes) && (
          <Grid
            as="dl"
            m={0}
            templateColumns="70px minmax(0, 1fr)"
            columnGap="10px"
            rowGap="2px"
            fontSize="13px"
            lineHeight="18px"
          >
            {showMethod && (
              <>
                <Text as="dt" {...mono} letterSpacing="0.06em" fontSize="10px" color="fg.muted">
                  METHOD
                </Text>
                <Text as="dd" m={0}>
                  {entry.method ? cleaningMethodLabel(entry.method) : "Not recorded"}
                </Text>
              </>
            )}
            {entry.sleeve_type && (
              <>
                <Text as="dt" {...mono} letterSpacing="0.06em" fontSize="10px" color="fg.muted">
                  SLEEVE
                </Text>
                <Text as="dd" m={0}>
                  {sleeveLabel(entry.sleeve_type)}
                </Text>
              </>
            )}
            {entry.notes && (
              <>
                <Text as="dt" {...mono} letterSpacing="0.06em" fontSize="10px" color="fg.muted">
                  NOTE
                </Text>
                <Text as="dd" m={0} wordBreak="break-word">
                  {entry.notes}
                </Text>
              </>
            )}
          </Grid>
        )}
        {action?.error && (
          <Text role="alert" fontSize="13px" color="fg.error">
            {action.error}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

type Props = {
  thisMonth: RecordCareProgressResponse["this_month"] | undefined;
  entries: RecordCareLogEntry[] | undefined;
  error?: Error | null;
  timeZone: string;
  /** The session saved on this visit; only it can be undone from here. */
  justSavedSessionId: number | null;
  onUndo: (sessionId: number) => void;
  undoPending?: boolean;
  undoError?: string | null;
  historyHref?: string;
};

/** Entries the column shows; the rest are in the full history. */
export const CARE_LOG_PREVIEW = 5;

/**
 * The care log (#944): the right column on desktop, the CARE LOG tab on a
 * phone. Recent logs newest first, without the undone ones, and a link to the
 * full history.
 */
export default function ChoresCareLog({
  thisMonth,
  entries,
  error,
  timeZone,
  justSavedSessionId,
  onUndo,
  undoPending,
  undoError,
  historyHref = "/chore/history",
}: Props) {
  let body: React.ReactNode;
  if (error) {
    body = (
      <Notice role="alert">COULDN&apos;T LOAD THE CARE LOG · {error.message.toUpperCase()}</Notice>
    );
  } else if (!entries) {
    body = (
      <Flex justify="center" py={6}>
        <Spinner size="sm" />
      </Flex>
    );
  } else {
    const live = entries.filter((entry) => !entry.voided).slice(0, CARE_LOG_PREVIEW);
    body =
      live.length === 0 ? (
        <Notice>NOTHING LOGGED YET. PULL A STACK AND LOG ITS CARE.</Notice>
      ) : (
        live.map((entry) => {
          const justSaved =
            entry.kind === "session" &&
            justSavedSessionId !== null &&
            entry.session_id === justSavedSessionId;
          return (
            <CareLogEntryCard
              key={careLogEntryKey(entry)}
              entry={entry}
              timeZone={timeZone}
              justSaved={justSaved}
              action={
                justSaved
                  ? {
                      label: "UNDO",
                      onClick: () => onUndo(justSavedSessionId),
                      pending: undoPending,
                      error: undoError,
                    }
                  : undefined
              }
            />
          );
        })
      );
  }

  return (
    <Stack gap={3} pr="6px">
      <SectionHeading id="chores-care-log-heading" display={{ base: "none", md: "flex" }}>
        CARE LOG
      </SectionHeading>
      {thisMonth && (
        <Text fontFamily="mono" fontSize="11px" letterSpacing="0.06em" color="fg.muted">
          {thisMonthLine(thisMonth)}
        </Text>
      )}
      <Stack gap="14px" pb={6}>
        {body}
        <Button asChild variant="outline" h="44px" w="full">
          <NextLink href={historyHref}>FULL CARE HISTORY →</NextLink>
        </Button>
      </Stack>
    </Stack>
  );
}
