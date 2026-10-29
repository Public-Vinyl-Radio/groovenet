"use client";

import React, { useMemo, useState } from "react";
import {
  Combobox,
  Flex,
  Portal,
  Switch,
  Text,
  chakra,
  createListCollection,
} from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import type { FilterChip } from "@/components/FilterChips";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import type { GenreFilterRef } from "@/lib/trackFilterSpec";
import { filterGenreOptions, genreFilterOptions, type GenreOption } from "@/lib/genres/options";

const CHIP_PREFIX = "genre:";
const SIMILAR_CHIP_PREFIX = "similar:";

/** Filter chips for the chosen genre slugs, named from the taxonomy once it loads. */
export function genreFilterChips(
  selected: string[],
  genres: GenreOption[],
  counts?: ReadonlyMap<string, number>,
): FilterChip[] {
  const byslug = new Map(genres.map((genre) => [genre.slug, genre]));
  return selected.map((slug) => {
    const genre = byslug.get(slug);
    return {
      key: `${CHIP_PREFIX}${slug}`,
      label: genre?.name ?? slug,
      active: true,
      count: genre ? counts?.get(genre.id) : undefined,
    };
  });
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

/** The chip key for "Include similar" itself, so the chip row can turn it off. */
export const INCLUDE_SIMILAR_CHIP_KEY = "include-similar";

/** "+ Similar genres" as its own chip while the toggle is on and a genre is chosen (#794). */
export function includeSimilarChips(includeSimilar: boolean, selected: string[]): FilterChip[] {
  return includeSimilar && selected.length > 0
    ? [{ key: INCLUDE_SIMILAR_CHIP_KEY, label: "+ Similar genres", active: true }]
    : [];
}

/**
 * The chosen genres as small removable tags under the genre field, in the
 * filters modal and panel (#794), named from the taxonomy once it loads.
 */
export function SelectedGenreTags({
  selected,
  onRemove,
}: {
  selected: string[];
  onRemove: (slug: string) => void;
}) {
  const { genres } = useGenreTaxonomyQuery();
  if (selected.length === 0) return null;
  const names = new Map(genres.map((genre) => [genre.slug, genre.name]));
  return (
    <Flex
      wrap="wrap"
      gap="6px"
      role="group"
      aria-label="Chosen genres"
      data-testid="selected-genre-tags"
    >
      {selected.map((slug) => {
        const name = names.get(slug) ?? slug;
        return (
          <chakra.button
            key={slug}
            type="button"
            aria-label={`Remove genre ${name}`}
            onClick={() => onRemove(slug)}
            display="inline-flex"
            alignItems="center"
            gap="4px"
            minH="32px"
            pl="8px"
            pr="4px"
            borderWidth="outline"
            borderColor="border.ink"
            bg="bg"
            fontFamily="label"
            fontSize="11px"
            fontWeight="semibold"
            textTransform="uppercase"
            _hover={{ bg: "bg.muted" }}
          >
            {name}
            <LuX aria-hidden="true" size={12} strokeWidth={2.5} />
          </chakra.button>
        );
      })}
    </Flex>
  );
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
 * handed to `onAdd` and the box cleared; the field shows how many genres are
 * selected, and the chips beside it own removal.
 */
export default function GenreFilter({
  selected,
  onAdd,
  counts,
  inSheet = false,
}: GenreFilterProps) {
  const { genres, isLoading, isError } = useGenreTaxonomyQuery();
  const [input, setInput] = useState("");

  const collection = useMemo(() => {
    const selectedIds = new Set(
      genres.filter((genre) => selected.includes(genre.slug)).map((genre) => genre.id),
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
          placeholder={
            isLoading ? "Loading…" : selected.length > 0 ? `Genre · ${selected.length}` : "Genre"
          }
        />
        <Combobox.IndicatorGroup>
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      {/* In a portal, so the filter row never clips the list. */}
      <Portal disabled={inSheet}>
        {/* In a sheet the list sits in the flow, so the sheet scrolls instead of clipping it. */}
        <Combobox.Positioner
          css={
            inSheet
              ? {
                  position: "static !important",
                  transform: "none !important",
                  minWidth: "0 !important",
                  zIndex: "auto !important",
                }
              : undefined
          }
        >
          <Combobox.Content minW={inSheet ? 0 : "240px"} maxH={inSheet ? "240px" : undefined}>
            <Combobox.Empty>
              {isError ? "Couldn't load genres" : "No matching genre"}
            </Combobox.Empty>
            {collection.items.map((genre) => (
              <Combobox.Item key={genre.id} item={genre}>
                <Combobox.ItemText>
                  {genre.name}
                  {genre.parent_name && (
                    <Text as="span" color="fg.muted" fontSize="xs">
                      {" "}
                      · {genre.parent_name}
                    </Text>
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
