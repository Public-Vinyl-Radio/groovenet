"use client";

import React from "react";
import { Flex, Stack, Text } from "@chakra-ui/react";
import type { RecordCareProgressResponse } from "@/services/internalApi/recordCare";
import { SectionHeading } from "@/components/spins/recapParts";

const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "S"}`;

/** "THIS MONTH · 11 RECORDS · 2 SESSIONS". */
export function thisMonthLine(thisMonth: NonNullable<RecordCareProgressResponse["this_month"]>) {
  return `THIS MONTH · ${plural(thisMonth.records, "RECORD")} · ${plural(thisMonth.sessions, "SESSION")}`;
}

/**
 * Where the care log goes: the right column on desktop, the CARE LOG tab on a
 * phone. The entries, undo and full history arrive with #944.
 */
export default function ChoresCareLogSlot({
  thisMonth,
}: {
  thisMonth: RecordCareProgressResponse["this_month"] | undefined;
}) {
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
      <Flex
        minH="72px"
        align="center"
        justify="center"
        px={4}
        borderWidth="outline"
        borderStyle="dashed"
        borderColor="border"
        fontFamily="mono"
        fontSize="11px"
        letterSpacing="0.08em"
        color="fg.muted"
        textAlign="center"
      >
        CARE LOG COMING SOON
      </Flex>
    </Stack>
  );
}
