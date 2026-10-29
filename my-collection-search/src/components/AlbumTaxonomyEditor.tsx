"use client";

import { Button, Stack, Text } from "@chakra-ui/react";
import GenrePicker from "@/components/GenrePicker";
import { useGenreTaxonomyQuery, useGenreLookup } from "@/hooks/useGenreTaxonomyQuery";
import { normalizeGenreName } from "@/lib/genres/normalization";
import type { Album } from "@/types/track";
import type { AlbumTaxonomyOverrides } from "@/api-contract/schemas";

/** Picks are full replacements; untouched categories continue following imports. */
export default function AlbumTaxonomyEditor({
  album,
  value,
  onChange,
}: {
  album: Album;
  value: AlbumTaxonomyOverrides;
  onChange: (value: AlbumTaxonomyOverrides) => void;
}) {
  const lookup = useGenreLookup();
  const { genres, isLoading, isError } = useGenreTaxonomyQuery();
  return (
    <Stack gap={4}>
      <Text fontWeight="semibold">Album genres and styles</Text>
      <Text fontSize="sm">
        Your replacements survive Discogs re-sync. Reset follows the latest Discogs values. Save
        Changes applies these choices.
      </Text>
      {(
        [
          ["genres", "genre_override_ids"],
          ["styles", "style_override_ids"],
        ] as const
      ).map(([kind, field]) => {
        const source = album[kind] ?? [];
        const ids = value[field];
        const overridden = ids != null;
        const selected = genres.filter((genre) =>
          overridden
            ? ids.includes(genre.id)
            : source.some(
                (name) =>
                  normalizeGenreName(name) === normalizeGenreName(genre.name) ||
                  lookup.get(normalizeGenreName(name)) === genre.slug,
              ),
        );
        return (
          <Stack key={kind} gap={2}>
            <Text fontSize="sm">
              Discogs {kind}: {source.join(", ") || "None"}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {overridden ? "Using your replacement" : "Using Discogs"}
            </Text>
            <GenrePicker
              label={`Your ${kind}`}
              value={selected}
              onChange={(picked) =>
                onChange({ ...value, [field]: picked.map((genre) => genre.id) })
              }
              disabled={isLoading || isError}
            />
            <Button
              size="sm"
              variant="outline"
              alignSelf="start"
              disabled={!overridden}
              onClick={() => onChange({ ...value, [field]: null })}
            >
              Reset {kind} to Discogs
            </Button>
          </Stack>
        );
      })}
    </Stack>
  );
}
