"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Combobox,
  Flex,
  Tag,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import type { TrackGenre } from "@/types/track";
import { useGenreTaxonomyQuery } from "@/hooks/useGenreTaxonomyQuery";
import { filterGenreOptions, type GenreOption } from "@/lib/genres/options";

type GenrePickerProps = {
  label?: string;
  value: TrackGenre[];
  onChange: (genres: TrackGenre[]) => void;
  /**
   * The track's free-text tags from before the taxonomy (#371), shown as a
   * hint while picking. Read-only: reconciliation (#372) maps them for real.
   */
  legacyTags?: string | null;
  disabled?: boolean;
};

/**
 * Track genres chosen from the canonical taxonomy. There is deliberately no
 * way to type a new genre here: the taxonomy only grows through its own
 * admin and review flow, which is what keeps genres searchable.
 */
export default function GenrePicker({
  label = "Genres",
  value,
  onChange,
  legacyTags,
  disabled,
}: GenrePickerProps) {
  const { genres, isLoading, isError } = useGenreTaxonomyQuery();
  const [input, setInput] = useState("");

  const selectedIds = useMemo(() => new Set(value.map((genre) => genre.id)), [value]);
  const collection = useMemo(
    () =>
      createListCollection<GenreOption>({
        items: filterGenreOptions(genres, input, selectedIds),
        itemToString: (genre) => genre.name,
        itemToValue: (genre) => genre.id,
      }),
    [genres, input, selectedIds]
  );

  const add = (id: string | undefined) => {
    const genre = genres.find((option) => option.id === id);
    if (!genre || selectedIds.has(genre.id)) return;
    const { id: genreId, name, slug, parent_id, parent_name } = genre;
    onChange([...value, { id: genreId, name, slug, parent_id, parent_name }]);
  };

  const remove = (id: string) => onChange(value.filter((genre) => genre.id !== id));

  const legacy = legacyTags?.trim();

  return (
    <Box flex="1">
      <Combobox.Root
        collection={collection}
        inputValue={input}
        onInputValueChange={(details) => setInput(details.inputValue)}
        // Each pick is added to `value` and the box cleared, rather than the
        // combobox holding the selection, so chips own removal.
        value={[]}
        onValueChange={(details) => add(details.value[0])}
        selectionBehavior="clear"
        openOnClick
        disabled={disabled}
      >
        <Combobox.Label fontSize="sm" fontWeight="normal" mb={1}>
          {label}
        </Combobox.Label>
        {value.length > 0 && (
          <Flex gap={1.5} flexWrap="wrap" mb={2} data-testid="genre-picker-selected">
            {value.map((genre) => (
              <Tag.Root key={genre.id} size="lg" variant="surface">
                <Tag.Label>
                  {genre.name}
                  {genre.parent_name && (
                    <Text as="span" color="fg.muted"> · {genre.parent_name}</Text>
                  )}
                </Tag.Label>
                <Tag.EndElement>
                  <Tag.CloseTrigger
                    aria-label={`Remove ${genre.name}`}
                    onClick={() => remove(genre.id)}
                    disabled={disabled}
                  />
                </Tag.EndElement>
              </Tag.Root>
            ))}
          </Flex>
        )}
        <Combobox.Control>
          <Combobox.Input
            placeholder={isLoading ? "Loading genres…" : "Search genres"}
            fontSize="16px"
          />
          <Combobox.IndicatorGroup>
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        {/* No Portal: the picker lives inside dialogs, whose focus trap would
            otherwise keep the list out of reach. */}
        <Combobox.Positioner>
          <Combobox.Content>
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
                {genre.track_count > 0 && (
                  <Text as="span" color="fg.muted" fontSize="xs">
                    {genre.track_count}
                  </Text>
                )}
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>
      {legacy && (
        <Text mt={1} fontSize="xs" color="fg.muted">
          Original tags: {legacy}
        </Text>
      )}
    </Box>
  );
}
