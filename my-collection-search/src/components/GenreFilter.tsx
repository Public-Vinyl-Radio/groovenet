"use client";

import React, { useMemo, useState } from "react";
import { Combobox, Portal, Switch, Text, createListCollection } from "@chakra-ui/react";
import type { FilterChip } from "@/components/FilterChips";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";
import {
  filterGenreOptions,
  genreFilterOptions,
  type GenreOption,
} from "@/lib/genres/options";

const CHIP_PREFIX = "genre:";
const SIMILAR_CHIP_PREFIX = "similar:";

/** Filter chips for the chosen genre slugs, named from the taxonomy once it loads. */
export function genreFilterChips(selected: string[], genres: GenreOption[]): FilterChip[] {
  const names = new Map(genres.map((genre) => [genre.slug, genre.name]));
  return selected.map((slug) => ({
    key: `${CHIP_PREFIX}${slug}`,
    label: names.get(slug) ?? slug,
    active: true,
  }));
}

/** The slug a genre chip's key stands for, or null for any other chip. */
export function genreSlugFromChipKey(key: string): string | null {
  return key.startsWith(CHIP_PREFIX) ? key.slice(CHIP_PREFIX.length) : null;
}

/**
 * Removable chips for the genres "Include similar" added (#485), e.g.
 * "+ Chicha, Porro, Digital Cumbia". Removing one excludes that id from the
 * widening (via `similarGenreIdFromChipKey`), rather than removing a seed.
 */
export function addedGenreChips(added: GenreFilterRef[]): FilterChip[] {
  return added.map((genre) => ({
    key: `${SIMILAR_CHIP_PREFIX}${genre.id}`,
    label: genre.name,
    active: true,
  }));
}

/** The related-genre id a similar-genre chip's key stands for, or null for any other chip. */
export function similarGenreIdFromChipKey(key: string): string | null {
  return key.startsWith(SIMILAR_CHIP_PREFIX) ? key.slice(SIMILAR_CHIP_PREFIX.length) : null;
}

/** The "Include similar" toggle (#485): widens the active genre filter to its top related genres. */
export function IncludeSimilarToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(details) => onChange(details.checked)}
      size="sm"
    >
      <Switch.HiddenInput />
      <Switch.Control />
      <Switch.Label>Include similar</Switch.Label>
    </Switch.Root>
  );
}

type GenreFilterProps = {
  /** Slugs already filtered on; they are not offered again. */
  selected: string[];
  onAdd: (slug: string) => void;
  /** Tracks per genre id for the current search; omit to show no counts. */
  counts?: ReadonlyMap<string, number>;
  /**
   * Fill the width and keep the list in place, for the phone filter sheet:
   * a list portalled out of the sheet would sit outside its focus trap.
   */
  inSheet?: boolean;
};

/**
 * Type-ahead over the genre taxonomy for search filters (#375). A pick is
 * handed to `onAdd` and the box cleared; the chosen genres show as chips
 * beside it, which own removal.
 */
export default function GenreFilter({ selected, onAdd, counts, inSheet = false }: GenreFilterProps) {
  const { genres, isLoading, isError } = useGenreTaxonomyQuery();
  const [input, setInput] = useState("");

  const collection = useMemo(() => {
    const selectedIds = new Set(
      genres.filter((genre) => selected.includes(genre.slug)).map((genre) => genre.id)
    );
    return createListCollection<GenreOption>({
      items: filterGenreOptions(genreFilterOptions(genres, counts), input, selectedIds),
      itemToString: (genre) => genre.name,
      itemToValue: (genre) => genre.id,
    });
  }, [genres, counts, input, selected]);

  return (
    <Combobox.Root
      collection={collection}
      inputValue={input}
      onInputValueChange={(details) => setInput(details.inputValue)}
      value={[]}
      onValueChange={(details) => details.items.forEach((genre) => onAdd(genre.slug))}
      selectionBehavior="clear"
      openOnClick
      size="sm"
      width={inSheet ? "full" : "160px"}
      flexShrink={0}
    >
      <Combobox.Control>
        <Combobox.Input
          aria-label="Filter by genre"
          placeholder={isLoading ? "Loading…" : "Genre"}
          borderRadius="full"
          fontSize="16px"
        />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      {/* In a portal, so the filter row never clips the list. */}
      <Portal disabled={inSheet}>
        <Combobox.Positioner>
          <Combobox.Content minW="240px">
            <Combobox.Empty>
              {isError ? "Couldn't load genres" : "No matching genre"}
            </Combobox.Empty>
            {collection.items.map((genre) => (
              <Combobox.Item key={genre.id} item={genre}>
                <Combobox.ItemText>
                  {genre.name}
                  {genre.parent_name && (
                    <Text as="span" color="fg.muted" fontSize="xs"> · {genre.parent_name}</Text>
                  )}
                </Combobox.ItemText>
                {counts && (
                  <Text as="span" color="fg.muted" fontSize="xs">
                    {genre.track_count}
                  </Text>
                )}
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
