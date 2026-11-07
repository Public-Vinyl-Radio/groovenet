"use client";

import React, { useMemo, useState } from "react";
import { Combobox, Field, Flex, Portal, Text, createListCollection } from "@chakra-ui/react";
import type { ArtistFilterRef, ArtistListItem } from "@/api-contract/schemas";
import type { FilterChip as FilterChipSpec } from "@/components/FilterChips";
import { FilterChip } from "@/components/ui/FilterChip";
import { ModalSection } from "@/components/ui/RetroModalParts";
import { useArtistSuggestions } from "@/hooks/useArtistListQuery";

const CHIP_PREFIX = "artist:";

/** An artist the viewer picked or the search named: enough for a chip's label. */
export type ArtistName = Pick<ArtistFilterRef, "slug" | "name">;

/**
 * The artist a filter value names, by slug or by id: the value is what the
 * URL holds, and `?artist=12` is as valid as `?artist=meridian-brothers`.
 */
function findArtist(value: string, known: readonly (ArtistName & { id?: number })[]) {
  return known.find((artist) => artist.slug === value || String(artist.id) === value);
}

/** Filter chips for the chosen artists (#709), named once the search or the picker has named them. */
export function artistFilterChips(
  selected: string[],
  known: readonly (ArtistName & { id?: number })[],
): FilterChipSpec[] {
  return selected.map((value) => ({
    key: `${CHIP_PREFIX}${value}`,
    label: findArtist(value, known)?.name ?? value,
    active: true,
  }));
}

/** The filter value an artist chip's key stands for, or null for any other chip. */
export function artistSlugFromChipKey(key: string): string | null {
  return key.startsWith(CHIP_PREFIX) ? key.slice(CHIP_PREFIX.length) : null;
}

/**
 * Names for the chosen artists: what the picker just named, then what the
 * search response echoed back (`filter_artists`), so a chip reads "Meridian
 * Brothers" from the moment it is picked and after a reload alike.
 */
export function useArtistNames(fromSearch: readonly ArtistFilterRef[] | undefined) {
  const [picked, setPicked] = useState<ArtistName[]>([]);
  const remember = React.useCallback((artist: ArtistName) => {
    setPicked((prev) => [...prev.filter((a) => a.slug !== artist.slug), artist]);
  }, []);
  const known = useMemo(() => [...(fromSearch ?? []), ...picked], [fromSearch, picked]);
  return { known, remember };
}

/** The chosen artists as small removable tags under the artist field, in the filters modal and panel. */
export function SelectedArtistTags({
  selected,
  known,
  onRemove,
}: {
  selected: string[];
  known: readonly (ArtistName & { id?: number })[];
  onRemove: (slug: string) => void;
}) {
  if (selected.length === 0) return null;
  return (
    <Flex
      wrap="wrap"
      gap="6px"
      role="group"
      aria-label="Chosen artists"
      data-testid="selected-artist-tags"
    >
      {selected.map((value) => {
        const name = findArtist(value, known)?.name ?? value;
        return (
          <FilterChip
            key={value}
            label={name}
            active
            aria-label={`Remove artist ${name}`}
            onClick={() => onRemove(value)}
          />
        );
      })}
    </Flex>
  );
}

type ArtistFilterProps = {
  /** Slugs already filtered on; they are not offered again. */
  selected: string[];
  onAdd: (artist: ArtistName) => void;
  /** Suggest only the artists credited in this collection. */
  friendId?: number;
};

/**
 * The artist filter's state and setters (#709), as the filters modal and
 * panel take it: the chosen slugs, the names known for them, and the
 * collection to suggest from.
 */
export type ArtistFilterControls = {
  selected: string[];
  known: readonly (ArtistName & { id?: number })[];
  onAdd: (artist: ArtistName) => void;
  onRemove: (slug: string) => void;
  friendId?: number;
};

/** The Artist section of the filters modal and panel: the picker, then the chosen artists. */
export function ArtistFilterSection({
  selected,
  known,
  onAdd,
  onRemove,
  friendId,
}: ArtistFilterControls) {
  return (
    <ModalSection label="Artist">
      <Field.Root>
        <Field.Label srOnly>Artist</Field.Label>
        <ArtistFilter selected={selected} onAdd={onAdd} friendId={friendId} />
      </Field.Root>
      <SelectedArtistTags selected={selected} known={known} onRemove={onRemove} />
    </ModalSection>
  );
}

/** "3 albums · 12 tracks", the counts an artist row carries. */
export function artistCountsLabel(artist: Pick<ArtistListItem, "album_count" | "track_count">) {
  const parts: string[] = [];
  if (artist.album_count > 0) {
    parts.push(`${artist.album_count} ${artist.album_count === 1 ? "album" : "albums"}`);
  }
  if (artist.track_count > 0) {
    parts.push(`${artist.track_count} ${artist.track_count === 1 ? "track" : "tracks"}`);
  }
  return parts.join(" · ");
}

/**
 * Type-ahead over the artists (#709), searched by name or any alias through
 * `GET /api/artists`. A pick is handed to `onAdd` and the box cleared. It sits
 * in the filter sheet's flow, like the genre field there, so the list never
 * leaves the sheet's focus trap.
 */
export default function ArtistFilter({ selected, onAdd, friendId }: ArtistFilterProps) {
  const [input, setInput] = useState("");
  const { data, isFetching, isError } = useArtistSuggestions(input, friendId);

  const collection = useMemo(
    () =>
      createListCollection<ArtistListItem>({
        items: (input.trim() ? (data?.items ?? []) : []).filter(
          (artist) => !selected.includes(artist.slug),
        ),
        itemToString: (artist) => artist.name,
        itemToValue: (artist) => artist.slug,
      }),
    [data, input, selected],
  );

  const empty = !input.trim()
    ? "Type an artist's name"
    : isError
      ? "Couldn't load artists"
      : isFetching
        ? "Searching…"
        : "No matching artist";

  return (
    <Combobox.Root
      collection={collection}
      inputValue={input}
      onInputValueChange={(details) => setInput(details.inputValue)}
      value={[]}
      onValueChange={(details) =>
        details.items.forEach((artist) => onAdd({ slug: artist.slug, name: artist.name }))
      }
      selectionBehavior="clear"
      size="sm"
      width="full"
    >
      <Combobox.Control>
        <Combobox.Input
          aria-label="Filter by artist"
          placeholder={selected.length > 0 ? `Artist · ${selected.length}` : "Artist"}
        />
      </Combobox.Control>
      <Portal disabled>
        <Combobox.Positioner
          css={{
            position: "static !important",
            transform: "none !important",
            minWidth: "0 !important",
            zIndex: "auto !important",
          }}
        >
          <Combobox.Content minW={0} maxH="240px">
            <Combobox.Empty>{empty}</Combobox.Empty>
            {collection.items.map((artist) => (
              <Combobox.Item key={artist.id} item={artist}>
                <Combobox.ItemText>{artist.name}</Combobox.ItemText>
                <Text as="span" color="fg.muted" fontSize="xs">
                  {artistCountsLabel(artist)}
                </Text>
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}
