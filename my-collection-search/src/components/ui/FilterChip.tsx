"use client";

import React from "react";
import { chakra, type HTMLChakraProps } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { roleRecipes } from "@/app/houseStyle";

const ChipRoot = chakra("button", roleRecipes.filterChip);

/** The chip's text: its label, then the count when the data has one. */
export function chipLabel({ label, count }: { label: string; count?: number }): string {
  return count === undefined ? label : `${label} · ${count.toLocaleString()}`;
}

export type FilterChipProps = Omit<HTMLChakraProps<"button">, "children"> & {
  label: string;
  /** Results it matches, shown in the label ("Cumbia · 41"). Omit where unknown. */
  count?: number;
  /** An applied filter, or a chosen value: surface fill, ink outline and an x that removes it. */
  active?: boolean;
};

/**
 * The one pressable, removable chip (#794, #963): filters, chosen genres and
 * pickers. Active, it is named "Remove filter …" unless the caller names it.
 */
export function FilterChip({ label, count, active = false, ...props }: FilterChipProps) {
  const text = chipLabel({ label, count });
  return (
    <ChipRoot
      type="button"
      active={active}
      aria-label={active ? `Remove filter ${text}` : undefined}
      aria-pressed={active ? undefined : false}
      title={text}
      {...props}
    >
      <chakra.span truncate>{text}</chakra.span>
      {active && <LuX aria-hidden="true" size={14} strokeWidth={2.5} />}
    </ChipRoot>
  );
}
