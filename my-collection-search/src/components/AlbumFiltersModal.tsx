"use client";

import React from "react";
import { Box, Field } from "@chakra-ui/react";
import GenreFilter, { IncludeSimilarToggle, SelectedGenreTags } from "@/components/GenreFilter";
import { optionStates } from "@/components/MissingFilter";
import RetroDialog from "@/components/ui/RetroDialog";
import { ChipToggle, FiltersFooter, ModalSection as Section } from "@/components/ui/RetroModalParts";
import type { MissingFilterOption } from "@/lib/trackFilters";

/** The album missing checks; each key is its URL parameter, as before #447. */
export const ALBUM_MISSING_OPTIONS: MissingFilterOption[] = [
  { key: "missing_library_identifier", label: "Library identifier", chipLabel: "Missing identifier" },
  { key: "missing_local_cover_art_url", label: "Local cover", chipLabel: "Missing local cover" },
  { key: "missing_audio", label: "Audio", chipLabel: "Missing audio" },
];

/**
 * The Albums filter state and its setters (#794). The page builds this once
 * and hands the same object to the phone modal and the desktop panel.
 */
export type AlbumFilterControls = {
  genres: string[];
  onAddGenre: (slug: string) => void;
  onRemoveGenre: (slug: string) => void;
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

/** "81 albums", "1 album". */
export function albumCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "album" : "albums"}`;
}

/** "Show 81 albums" for the primary button, or "Show albums" before the count is known. */
export function showAlbumsLabel(count: number | null): string {
  return count === null ? "Show albums" : `Show ${albumCountLabel(count)}`;
}

/** Genre, with its tags and Include similar, then the missing checks: the body of the modal and the panel. */
export function AlbumFilterSections({
  genres,
  onAddGenre,
  onRemoveGenre,
  includeSimilar,
  onIncludeSimilarChange,
  missing,
  onToggleMissing,
}: AlbumFilterControls) {
  return (
    <>
      <Section label="Genre" first>
        <Field.Root>
          <Field.Label srOnly>Genre</Field.Label>
          <GenreFilter selected={genres} onAdd={onAddGenre} inSheet />
        </Field.Root>
        <SelectedGenreTags selected={genres} onRemove={onRemoveGenre} />
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
    </>
  );
}

type Props = AlbumFilterControls & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The phone's "Filters" modal on Albums (#751): genre and the Missing checks
 * in one centred sheet. Changes apply as they're made, so the count on the
 * primary button follows them and "Show" just closes.
 */
export default function AlbumFiltersModal({ open, onOpenChange, ...filters }: Props) {
  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      footer={
        <FiltersFooter
          activeCount={filters.activeCount}
          onReset={filters.onReset}
          showLabel={showAlbumsLabel(filters.resultCount)}
          onShow={() => onOpenChange(false)}
        />
      }
    >
      <AlbumFilterSections {...filters} />
    </RetroDialog>
  );
}
