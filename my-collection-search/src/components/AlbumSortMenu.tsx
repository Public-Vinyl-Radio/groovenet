"use client";

import React from "react";
import { Menu, Text } from "@chakra-ui/react";
import { LuArrowUpDown, LuChevronDown } from "react-icons/lu";
import { HeaderButton } from "@/components/layout/ListHeader";

export const DEFAULT_ALBUM_SORT = "created_at:desc";

export const ALBUM_SORT_OPTIONS = [
  { value: "created_at:desc", label: "Recently added" },
  { value: "date_added:desc", label: "Newest in Discogs" },
  { value: "date_added:asc", label: "Oldest in Discogs" },
  { value: "year:desc", label: "Newest releases" },
  { value: "year:asc", label: "Oldest releases" },
  { value: "title:asc", label: "Title A–Z" },
  { value: "album_rating:desc", label: "Highest rated" },
] as const;

/** The option for a sort value; an unknown one is the default. */
export const albumSortOption = (value: string) =>
  ALBUM_SORT_OPTIONS.find((opt) => opt.value === value) ?? ALBUM_SORT_OPTIONS[0];

type Props = {
  value: string;
  onChange: (sort: string) => void;
};

/**
 * The seven-option sort menu (#751), as the desktop search row's
 * `SORT RECENTLY ADDED ▾` (#794). Phones sort from the filters modal.
 */
export default function AlbumSortMenu({ value, onChange }: Props) {
  const current = albumSortOption(value);
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <HeaderButton size="search" px="14px" aria-label={`Sort: ${current.label}`}>
          <LuArrowUpDown aria-hidden="true" />
          <Text as="span" color="fg.muted">
            Sort
          </Text>
          {current.label}
          <LuChevronDown aria-hidden="true" />
        </HeaderButton>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content>
          {ALBUM_SORT_OPTIONS.map((opt) => (
            <Menu.Item
              key={opt.value}
              value={opt.value}
              onClick={() => onChange(opt.value)}
              fontWeight={value === opt.value ? "bold" : "normal"}
            >
              {opt.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}
