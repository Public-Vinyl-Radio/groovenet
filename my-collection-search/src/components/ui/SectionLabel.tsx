"use client";

import React from "react";
import NextLink from "next/link";
import { Box, chakra, Flex, type BoxProps, type FlexProps } from "@chakra-ui/react";
import { sectionRecipes } from "@/app/houseStyle";

// A section's label in the Labels face, always (#991): capitals by CSS, so write
// it in sentence case or capitals as you like. `strip` is the ink tab on a
// rule, `overline` quiet muted text, `bar` a linked ink bar, `header` a card
// header row inside the card it titles. The look lives in
// `sectionRecipes` in houseStyle.ts.

const LabelRoot = chakra("h2", sectionRecipes.sectionLabel);
const BarRoot = chakra("div", sectionRecipes.sectionBar);
const HeaderRoot = chakra("div", sectionRecipes.sectionHeader);
const HeaderMeta = chakra("span", sectionRecipes.sectionHeaderMeta);
const HeaderLink = chakra(NextLink, sectionRecipes.sectionHeaderLink);

type Base = {
  /** h2 for a page section, h3 for one inside it. `null` renders a span when the heading is elsewhere. */
  level?: 2 | 3 | null;
  id?: string;
  children: React.ReactNode;
};

export type SectionLabelProps =
  | (Base & {
      variant: "strip";
      /** Whatever ends the row, after the rule: a count, a link. */
      meta?: React.ReactNode;
    } & Omit<FlexProps, "children" | "id">)
  | (Base & { variant: "overline"; meta?: never } & Omit<BoxProps, "children" | "id">)
  | (Base & {
      variant: "bar";
      /** The whole bar is this link. */
      href: string;
      /** The trailing label: "Full recap →". */
      meta?: React.ReactNode;
    } & Omit<FlexProps, "children" | "id" | "href">)
  | (Base & {
      variant: "header";
      /** Muted text after the label; wraps to a second line on a phone. */
      meta?: React.ReactNode;
      /** The trailing link, e.g. "All →". */
      link?: { href: string; label: string };
    } & Omit<FlexProps, "children" | "id">);

const tagFor = (level: 2 | 3 | null | undefined) =>
  level === null ? "span" : level === 3 ? "h3" : "h2";

/** A section's label: an ink strip and rule, a quiet overline, a linked ink bar, or a card header row. */
export function SectionLabel(props: SectionLabelProps) {
  const { level = 2, id, children, variant } = props;
  if (variant === "overline") {
    // A site may lay the overline out as a panel (Now playing) with style props.
    const { level: _level, id: _id, children: _children, variant: _variant, ...rest } = props;
    return (
      <LabelRoot as={tagFor(level)} id={id} variant="overline" {...rest}>
        {children}
      </LabelRoot>
    );
  }
  if (variant === "bar") {
    const {
      href,
      meta,
      level: _level,
      id: _id,
      children: _children,
      variant: _variant,
      ...rest
    } = props;
    return (
      <BarRoot asChild {...(rest as object)}>
        <NextLink href={href}>
          <LabelRoot as={tagFor(level)} id={id} variant="bar">
            {children}
          </LabelRoot>
          {meta && <span>{meta}</span>}
        </NextLink>
      </BarRoot>
    );
  }
  if (variant === "header") {
    const {
      meta,
      link,
      level: _level,
      id: _id,
      children: _children,
      variant: _variant,
      ...rest
    } = props;
    return (
      <HeaderRoot {...(rest as object)}>
        <LabelRoot as={tagFor(level)} id={id} variant="header">
          {children}
        </LabelRoot>
        {meta && <HeaderMeta>{meta}</HeaderMeta>}
        {link && <HeaderLink href={link.href}>{link.label}</HeaderLink>}
      </HeaderRoot>
    );
  }
  const { meta, level: _level, id: _id, children: _children, variant: _variant, ...rest } = props;
  return (
    <Flex align="center" gap={3} {...rest}>
      <LabelRoot as={tagFor(level)} id={id} variant="strip">
        {children}
      </LabelRoot>
      <Box flex="1" minW={5} h="2px" bg="fg" aria-hidden="true" />
      {meta}
    </Flex>
  );
}
