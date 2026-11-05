"use client";

import React from "react";
import { chakra, Flex, type FlexProps } from "@chakra-ui/react";
import { sectionRecipes } from "@/app/houseStyle";

// A section's title in the display face (#991). One size for every section:
// `level` picks the element (h2 for a page section, h3 for one nested in it),
// never the size. The look lives in `sectionRecipes` in houseStyle.ts.

const HeadingRoot = chakra("h2", sectionRecipes.sectionHeading);
const MetaRoot = chakra("span", sectionRecipes.sectionMeta);

export type SectionHeadingProps = Omit<FlexProps, "children" | "id" | "ref"> & {
  /** The heading element, for a caller that moves focus to it. */
  ref?: React.Ref<HTMLHeadingElement>;
  tabIndex?: number;
  /** h2 for a page section, h3 for a section inside one. Never changes the size. */
  level?: 2 | 3;
  id?: string;
  children: React.ReactNode;
  /** A count or summary beside the title, in the Labels face: "12 tracks". */
  meta?: React.ReactNode;
  /** Buttons and links at the end of the row. */
  actions?: React.ReactNode;
};

/** A section's title: display face, 18/24 (17/22 on phones), with optional meta and actions. */
export function SectionHeading({
  level = 2,
  id,
  ref,
  children,
  meta,
  actions,
  tabIndex,
  ...rest
}: SectionHeadingProps) {
  const as = level === 3 ? "h3" : "h2";
  if (!meta && !actions) {
    return (
      <HeadingRoot as={as} id={id} ref={ref} tabIndex={tabIndex} {...(rest as object)}>
        {children}
      </HeadingRoot>
    );
  }
  return (
    <Flex flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={3} {...rest}>
      <Flex alignItems="baseline" gap={3} minW={0}>
        <HeadingRoot as={as} id={id} ref={ref} tabIndex={tabIndex}>
          {children}
        </HeadingRoot>
        {meta && <MetaRoot>{meta}</MetaRoot>}
      </Flex>
      {actions && (
        <Flex alignItems="center" gap={2}>
          {actions}
        </Flex>
      )}
    </Flex>
  );
}
