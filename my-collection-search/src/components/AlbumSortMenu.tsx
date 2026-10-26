"use client";

import React from "react";
import { Button, Menu, Text } from "@chakra-ui/react";
import { LuArrowUpDown, LuChevronDown } from "react-icons/lu";
import { HeaderButton } from "@/components/layout/ListHeader";

export const DEFAULT_ALBUM_SORT = "created_at:desc";

export const ALBUM_SORT_OPTIONS = [
  { value: "created_at:desc", label: "Recently Added" },
  { value: "date_added:desc", label: "Newest in Discogs" },
  { value: "date_added:asc", label: "Oldest in Discogs" },
  { value: "year:desc", label: "Newest Releases" },
  { value: "year:asc", label: "Oldest Releases" },
  { value: "title:asc", label: "Title (A-Z)" },
  { value: "album_rating:desc", label: "Highest Rated" },
] as const;

type Props = {
  value: string;
  onChange: (sort: string) => void;
  /**
   * "button": the desktop search row's `SORT RECENTLY ADDED ▾` (#794). "label":
   * the phone's `Recently Added ▾` beside the count.
   */
  trigger: "button" | "label";
};

/** The seven-option sort menu (#751), behind either trigger. */
export default function AlbumSortMenu({ value, onChange, trigger }: Props) {
  const current = ALBUM_SORT_OPTIONS.find((opt) => opt.value === value) ?? ALBUM_SORT_OPTIONS[0];
  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        {trigger === "button" ? (
          <HeaderButton size="search" px="14px" aria-label={`Sort: ${current.label}`}>
            <LuArrowUpDown aria-hidden="true" />
            <Text as="span" color="fg.muted">
              Sort
            </Text>
            {current.label}
            <LuChevronDown aria-hidden="true" />
          </HeaderButton>
        ) : (
          <Button aria-label={`Sort: ${current.label}`} variant="ghost" size="sm" minH="44px" px={2} color="fg.muted">
            {current.label}
            <LuChevronDown />
          </Button>
        )}
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
