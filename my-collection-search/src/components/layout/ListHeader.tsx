"use client";

import React from "react";
import { Box, Button, Flex, SegmentGroup, chakra, type ButtonProps } from "@chakra-ui/react";
import { LuSearch, LuSlidersHorizontal } from "react-icons/lu";
import type { TrackViewMode } from "@/hooks/useTrackViewMode";

// The desktop list header (#794) is three rows in one style: the page row
// (PageHeader with `desktopActions`), the search row below, then the chip row
// (`FilterChips`). Every control has a 2px outline and a mono capital label;
// nothing sits in a toolbar box.

const controlLabel = {
  fontFamily: "label",
  fontSize: "12px",
  fontWeight: "semibold",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
} as const;

type HeaderButtonProps = Omit<ButtonProps, "size"> & {
  /** `page`: 40px, in the page row. `search`: 48px, beside the search field. */
  size?: "page" | "search";
  /** Quiet grey outline instead of ink, for a secondary page-row action (SELECT). */
  quiet?: boolean;
};

/**
 * A labelled header control: mono capitals, 2px outline. `variant="solid"`
 * marks the one primary action (ADD ALBUM) or an active state (FILTERS · 4).
 */
export function HeaderButton({ size = "page", quiet = false, variant = "outline", ...rest }: HeaderButtonProps) {
  return (
    <Button
      variant={variant}
      h={size === "search" ? "48px" : "40px"}
      px={size === "search" ? 4 : "14px"}
      gap={2}
      flexShrink={0}
      borderWidth="outline"
      borderColor={quiet ? "border" : "border.ink"}
      {...controlLabel}
      {...rest}
    />
  );
}

/**
 * FILTERS, last in the search row: an outline while nothing is on, solid with
 * the count (`FILTERS · 4`) once anything is.
 */
export function FiltersButton({ activeCount, ...rest }: Omit<HeaderButtonProps, "children"> & { activeCount: number }) {
  return (
    <HeaderButton
      size="search"
      variant={activeCount > 0 ? "solid" : "outline"}
      {...rest}
    >
      <LuSlidersHorizontal aria-hidden="true" />
      {activeCount > 0 ? `Filters · ${activeCount}` : "Filters"}
    </HeaderButton>
  );
}

const VIEW_ITEMS: { value: TrackViewMode; label: string }[] = [
  { value: "row", label: "List" },
  { value: "card", label: "Grid" },
];

/** The labelled LIST / GRID switch in the page row; the selection is an ink fill. */
export function ViewModeSwitch({
  value,
  onChange,
}: {
  value: TrackViewMode;
  onChange: (mode: TrackViewMode) => void;
}) {
  return (
    <SegmentGroup.Root
      value={value}
      aria-label="View"
      h="40px"
      flexShrink={0}
      css={{ "& label": { height: "100%", px: "14px", ...controlLabel } }}
      onValueChange={(details) => onChange(details.value as TrackViewMode)}
    >
      <SegmentGroup.Indicator />
      <SegmentGroup.Items items={VIEW_ITEMS} />
    </SegmentGroup.Root>
  );
}

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  /** The field's accessible name ("Search tracks"). */
  label: string;
  /** Inside the field's right end, behind a 2px rule: the Tracks search-mode menu. */
  endElement?: React.ReactNode;
};

/**
 * The 48px search field (44px on phones): ink outline, the magnifier, and an
 * optional control fused onto its right end. The ring goes round the whole
 * field while the input has focus.
 */
export function SearchField({ value, onChange, onEnter, placeholder, label, endElement }: SearchFieldProps) {
  return (
    <Flex
      data-testid="search-field"
      flex="1"
      minW={0}
      h={{ base: "44px", md: "48px" }}
      borderWidth="outline"
      borderColor="border.ink"
      bg="bg"
      align="stretch"
      css={{
        "&:has(input:focus-visible)": {
          outline: "2px solid var(--gn-accent-focus-ring)",
          outlineOffset: "2px",
        },
      }}
    >
      <Flex as="label" flex="1" minW={0} align="center" gap="10px" px="14px" cursor="text">
        <Box color="fg.muted" flexShrink={0} display="flex" aria-hidden="true">
          <LuSearch size={18} />
        </Box>
        <chakra.input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
          placeholder={placeholder}
          aria-label={label}
          flex="1"
          minW={0}
          h="full"
          bg="transparent"
          color="fg"
          fontFamily="body"
          // 16px so iOS doesn't zoom on focus; the field's ring stands in for the input's own.
          fontSize="16px"
          css={{ outline: "none", "&::placeholder": { color: "var(--gn-ink-muted)" } }}
        />
      </Flex>
      {endElement ? (
        <Flex flexShrink={0} borderLeftWidth="outline" borderColor="border.ink" align="stretch">
          {endElement}
        </Flex>
      ) : null}
    </Flex>
  );
}

/**
 * The search row: the field (up to `maxW`), then the page's controls, which are
 * desktop only (phones reach them from the header menu).
 */
export function ListSearchRow({
  field,
  controls,
  maxW = "760px",
}: {
  field: React.ReactNode;
  controls?: React.ReactNode;
  maxW?: string;
}) {
  return (
    <Flex data-testid="list-search-row" align="center" gap={3} pr={{ md: "6px" }} mb={{ base: 3, md: 4 }}>
      <Flex flex="1" minW={0} maxW={{ md: maxW }}>
        {field}
      </Flex>
      {controls ? (
        <Flex display={{ base: "none", md: "flex" }} align="center" gap={3}>
          {controls}
        </Flex>
      ) : null}
    </Flex>
  );
}
