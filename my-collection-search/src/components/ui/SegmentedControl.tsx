"use client";

import React from "react";
import { Button, Flex, Tabs, type ConditionalValue } from "@chakra-ui/react";

export type SegmentItem = { value: string; label: React.ReactNode };

type CommonProps = {
  items: readonly SegmentItem[];
  "aria-label": string;
  /**
   * Draw the strip's own 2px outline and rounded outer corners. Leave off inside
   * a frame that already has them: the frame's radius and `overflow: hidden`
   * round the strip, and a bottom rule closes it.
   */
  framed?: boolean;
  /** Layout in the parent, e.g. full width on a phone. */
  w?: ConditionalValue<string>;
  alignSelf?: ConditionalValue<string>;
};

export type SegmentedControlProps = CommonProps &
  (
    | {
        /** Plain toggle buttons (`aria-pressed`). */
        tabs?: false;
        value: string;
        onValueChange: (value: string) => void;
      }
    | {
        /**
         * Tab triggers with `Tabs` semantics and keyboard support. Render inside
         * `Tabs.Root`, which owns the value.
         */
        tabs: true;
        value?: never;
        onValueChange?: never;
      }
  );

const segmentLabel = { fontSize: "xs", letterSpacing: "0.06em" } as const;

/**
 * One joined strip of segments: square cells split by single rules, the
 * selected one an ink fill. Only the strip's outer corners round (through the
 * frame's radius), never the seams between segments.
 */
export function SegmentedControl({
  items,
  framed = false,
  tabs = false,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  ...rest
}: SegmentedControlProps) {
  const strip = {
    display: "grid",
    gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
    gap: 0,
    overflow: "hidden",
    borderColor: "border.ink",
    ...(framed ? { borderWidth: "outline", borderRadius: "md" } : { borderBottomWidth: "outline" }),
    ...rest,
  } as const;
  // A rule between segments, in place of the outline each one used to draw.
  const cell = (index: number) =>
    ({
      justifyContent: "center",
      minH: "44px",
      borderWidth: 0,
      borderRadius: "0",
      borderInlineStartWidth: index ? "rule" : 0,
      borderColor: "border.ink",
      boxShadow: "none",
      // The hover tint must not wash out the selected segment's ink fill.
      _selected: { bg: "neutral.solid", color: "neutral.contrast" },
      "&[data-selected]:hover, &[aria-pressed=true]:hover": { bg: "neutral.solid" },
      ...segmentLabel,
    }) as const;

  if (tabs) {
    return (
      <Tabs.List aria-label={ariaLabel} {...strip}>
        {items.map((item, index) => (
          <Tabs.Trigger key={item.value} value={item.value} {...cell(index)}>
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    );
  }
  return (
    <Flex role="group" aria-label={ariaLabel} {...strip} display="flex">
      {items.map((item, index) => (
        <Button
          key={item.value}
          flex={1}
          variant={value === item.value ? "solid" : "ghost"}
          colorPalette="neutral"
          aria-pressed={value === item.value}
          onClick={() => onValueChange?.(item.value)}
          {...cell(index)}
        >
          {item.label}
        </Button>
      ))}
    </Flex>
  );
}
