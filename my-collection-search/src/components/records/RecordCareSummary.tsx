"use client";

import React from "react";
import { Badge, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { RecordCareStatus, SleeveType } from "@/lib/recordCare";
import type { RecordCareSummaryResponse } from "@/services/internalApi/recordCare";
import { SLEEVE_OPTIONS, sleeveLabel } from "./recordCareFormat";

type Props = {
  summary: RecordCareSummaryResponse;
  status: RecordCareStatus;
  onStatusChange: (status: RecordCareStatus) => void;
};

/** The three chores as counts that double as the list's filter, then copies by sleeve. */
export default function RecordCareSummary({ summary, status, onStatusChange }: Props) {
  const tiles: { status: RecordCareStatus; label: string; count: number; hint: string }[] = [
    {
      status: "never_cleaned",
      label: "Never cleaned",
      count: summary.never_cleaned,
      hint: "No cleaning logged",
    },
    {
      status: "overdue",
      label: "Overdue",
      count: summary.overdue,
      hint: `Not cleaned in ${summary.overdue_days} days`,
    },
    {
      status: "needs_sleeve",
      label: "Needs a sleeve",
      count: summary.needs_sleeve,
      hint: `Not yet in ${sleeveLabel(summary.needs_sleeve_type).toLowerCase()}`,
    },
  ];
  const sleeves: (SleeveType | "unknown")[] = [
    ...SLEEVE_OPTIONS.map((option) => option.value),
    "unknown",
  ];

  return (
    <Stack gap={3}>
      <SimpleGrid columns={{ base: 1, sm: 3 }} gap={3}>
        {tiles.map((tile) => (
          <Button
            key={tile.status}
            variant={status === tile.status ? "subtle" : "outline"}
            aria-pressed={status === tile.status}
            onClick={() => onStatusChange(tile.status)}
            h="auto"
            py={3}
            justifyContent="flex-start"
          >
            <Stack gap={0} align="start" textAlign="left">
              <Text fontSize="2xl" fontWeight="bold" lineHeight="short">{tile.count}</Text>
              <Text fontSize="sm" fontWeight="semibold">{tile.label}</Text>
              <Text fontSize="xs" color="fg.muted" fontWeight="normal">{tile.hint}</Text>
            </Stack>
          </Button>
        ))}
      </SimpleGrid>
      <HStack gap={2} wrap="wrap" fontSize="xs" aria-label="Copies by sleeve">
        <Text color="fg.muted">{summary.total} copies by sleeve:</Text>
        {sleeves.map((sleeve) => (
          <Badge key={sleeve} size="sm" variant="surface">
            {sleeve === "unknown" ? "Unknown" : sleeveLabel(sleeve)} {summary.by_sleeve_type[sleeve]}
          </Badge>
        ))}
      </HStack>
    </Stack>
  );
}
