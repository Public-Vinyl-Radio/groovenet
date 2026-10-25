"use client";

import React from "react";
import { Box, Button, Field } from "@chakra-ui/react";
import GenreFilter, { IncludeSimilarToggle } from "@/components/GenreFilter";
import { optionStates } from "@/components/MissingFilter";
import RetroDialog from "@/components/ui/RetroDialog";
import { ChipToggle, ModalSection as Section } from "@/components/ui/RetroModalParts";
import type { MissingFilterOption } from "@/lib/trackFilters";

/** The album missing checks; each key is its URL parameter, as before #447. */
export const ALBUM_MISSING_OPTIONS: MissingFilterOption[] = [
  { key: "missing_library_identifier", label: "Library identifier", chipLabel: "Missing identifier" },
  { key: "missing_local_cover_art_url", label: "Local cover", chipLabel: "Missing local cover" },
  { key: "missing_audio", label: "Audio", chipLabel: "Missing audio" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genres: string[];
  onAddGenre: (slug: string) => void;
  includeSimilar: boolean;
  onIncludeSimilarChange: (checked: boolean) => void;
  missing: Record<string, boolean>;
  onToggleMissing: (key: string) => void;
  /** Filters on; Reset is disabled at zero. */
  activeCount: number;
  /** Albums for the current search and filters, shown on the primary button; null until known. */
  resultCount: number | null;
  onReset: () => void;
};

/**
 * The phone's "Filters" modal on Albums (#751): genre and the Missing checks
 * in one centred sheet. Changes apply as they're made, so the count on the
 * primary button follows them and "Show" just closes.
 */
export default function AlbumFiltersModal({
  open,
  onOpenChange,
  genres,
  onAddGenre,
  includeSimilar,
  onIncludeSimilarChange,
  missing,
  onToggleMissing,
  activeCount,
  resultCount,
  onReset,
}: Props) {
  const showLabel =
    resultCount === null ? "Show albums" : `Show ${resultCount.toLocaleString()} ${resultCount === 1 ? "album" : "albums"}`;

  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      footer={
        <Box display="flex" gap={2} p="12px 14px 12px 12px">
          <Button variant="outline" minH="44px" flexShrink={0} disabled={activeCount === 0} onClick={onReset}>
            Reset
          </Button>
          <Button variant="solid" minH="44px" flex="1" minW={0} onClick={() => onOpenChange(false)}>
            {showLabel}
          </Button>
        </Box>
      }
    >
      <Section label="Genre" first>
        <Field.Root>
          <Field.Label srOnly>Genre</Field.Label>
          <GenreFilter selected={genres} onAdd={onAddGenre} inSheet />
        </Field.Root>
        {genres.length > 0 && <IncludeSimilarToggle checked={includeSimilar} onChange={onIncludeSimilarChange} />}
      </Section>

      <Section label="Only albums missing">
        <Box display="flex" flexWrap="wrap" gap={2} role="group" aria-label="Only albums missing">
          {optionStates(ALBUM_MISSING_OPTIONS, missing).map(({ option, checked, disabled }) => (
            <ChipToggle
              key={option.key}
              checked={checked}
              disabled={disabled}
              onClick={() => onToggleMissing(option.key)}
            >
              {option.label}
            </ChipToggle>
          ))}
        </Box>
      </Section>
    </RetroDialog>
  );
}
