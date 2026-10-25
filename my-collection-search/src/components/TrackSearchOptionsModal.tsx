"use client";

import React from "react";
import { Box, Button, Field, SegmentGroup, Text, chakra } from "@chakra-ui/react";
import type { TrackSearchMode } from "@/api-contract/schemas";
import GenreFilter, { IncludeSimilarToggle } from "@/components/GenreFilter";
import { BpmFields, KeyField, RatingField } from "@/components/AttributeFilter";
import { optionStates } from "@/components/MissingFilter";
import RetroDialog from "@/components/ui/RetroDialog";
import { overline } from "@/components/ui/RetroModalParts";
import { SEARCH_MODE_ITEMS } from "@/components/search/SearchModeToggle";
import {
  TRACK_MISSING_OPTIONS,
  type TrackAttributeFilters,
  type TracksFilter,
} from "@/lib/trackFilters";

/** One line under the switch, saying what the chosen mode does. */
export const SEARCH_MODE_HINTS: Record<TrackSearchMode, string> = {
  lexical: "Matches the words you type.",
  hybrid: "Matches words, and also finds a sound you describe.",
  semantic: "Finds tracks by the sound you describe, not exact words.",
};

/** The chip text for each check, shorter than its menu label. */
const MISSING_CHIP_LABELS: Partial<Record<keyof TracksFilter, string>> = {
  missingMetadata: "BPM/key",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TrackSearchMode;
  onModeChange: (mode: TrackSearchMode) => void;
  genres: string[];
  onAddGenre: (slug: string) => void;
  genreCounts?: ReadonlyMap<string, number>;
  includeSimilar: boolean;
  onIncludeSimilarChange: (checked: boolean) => void;
  attributes: TrackAttributeFilters;
  onAttributesChange: (next: TrackAttributeFilters) => void;
  missing: TracksFilter;
  onToggleMissing: (key: keyof TracksFilter) => void;
  /** Filters on; Reset is disabled at zero. */
  activeCount: number;
  /** Results for the current search and filters, shown on the primary button. */
  resultCount: number;
  onReset: () => void;
};

const section = { p: "10px 14px 12px 12px", borderTopWidth: "rule", borderColor: "border" } as const;

function Section({ label, first, children }: { label?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <Box {...section} borderTopWidth={first ? 0 : "rule"} display="flex" flexDirection="column" gap={3}>
      {label && (
        <Text {...overline} color="fg.muted">
          {label}
        </Text>
      )}
      {children}
    </Box>
  );
}

/**
 * The phone's "Search options" modal (#751): search mode and every filter in
 * one centred sheet. Changes apply as they're made, so the count on the
 * primary button follows them and "Show" just closes.
 */
export default function TrackSearchOptionsModal({
  open,
  onOpenChange,
  mode,
  onModeChange,
  genres,
  onAddGenre,
  genreCounts,
  includeSimilar,
  onIncludeSimilarChange,
  attributes,
  onAttributesChange,
  missing,
  onToggleMissing,
  activeCount,
  resultCount,
  onReset,
}: Props) {
  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search options"
      footer={
        <Box display="flex" gap={2} p="12px 14px 12px 12px">
          <Button variant="outline" minH="44px" flexShrink={0} disabled={activeCount === 0} onClick={onReset}>
            Reset
          </Button>
          <Button variant="solid" minH="44px" flex="1" minW={0} onClick={() => onOpenChange(false)}>
            Show {resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
          </Button>
        </Box>
      }
    >
      <Section label="Search mode" first>
        <SegmentGroup.Root
          value={mode}
          aria-label="Search mode"
          h="44px"
          css={{ "& label": { flex: 1, justifyContent: "center", height: "100%" } }}
          onValueChange={(details) => onModeChange(details.value as TrackSearchMode)}
        >
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={SEARCH_MODE_ITEMS} />
        </SegmentGroup.Root>
        <Text fontSize="13px" color="fg.muted" data-testid="search-mode-hint">
          {SEARCH_MODE_HINTS[mode]}
        </Text>
      </Section>

      <Section label="Genre and key">
        <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
          <Field.Root>
            <Field.Label>Genre</Field.Label>
            <GenreFilter selected={genres} onAdd={onAddGenre} counts={genreCounts} inSheet />
          </Field.Root>
          <KeyField value={attributes} onChange={onAttributesChange} />
        </Box>
        {genres.length > 0 && <IncludeSimilarToggle checked={includeSimilar} onChange={onIncludeSimilarChange} />}
      </Section>

      <Section label="Tempo and rating">
        <BpmFields value={attributes} onChange={onAttributesChange} />
        <RatingField value={attributes} onChange={onAttributesChange} touchTarget />
      </Section>

      <Section label="Only tracks missing">
        <Box display="flex" flexWrap="wrap" gap={2} role="group" aria-label="Only tracks missing">
          {optionStates(TRACK_MISSING_OPTIONS, missing).map(({ option, checked, disabled }) => (
            <chakra.button
              key={option.key}
              type="button"
              aria-pressed={checked}
              disabled={disabled}
              onClick={() => onToggleMissing(option.key)}
              minH="44px"
              px="12px"
              borderWidth="outline"
              borderColor="border.ink"
              bg={checked ? "border.ink" : "bg"}
              color={checked ? "bg" : "fg"}
              fontFamily="label"
              fontSize="13px"
              fontWeight="semibold"
              _hover={{ bg: checked ? "border.ink" : "bg.muted" }}
              _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
            >
              {MISSING_CHIP_LABELS[option.key] ?? option.label}
            </chakra.button>
          ))}
        </Box>
      </Section>
    </RetroDialog>
  );
}
