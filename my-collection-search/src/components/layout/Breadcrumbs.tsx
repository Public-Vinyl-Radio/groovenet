"use client";

import React from "react";
import NextLink from "next/link";
import { Flex, Link, Text, type FlexProps } from "@chakra-ui/react";

export type Crumb = {
  label: string;
  /**
   * Parents link. A last crumb without one is the current page; a trail whose
   * last crumb links is all parents, for a page whose h1 is its only name (the
   * track page ends at its album, #1231).
   */
  href?: string;
};

/** The index of the crumb naming the current page, or -1 when every crumb is a parent. */
export function currentCrumbIndex(crumbs: Crumb[]): number {
  const last = crumbs.length - 1;
  return last >= 0 && !crumbs[last].href ? last : -1;
}

/** The parent a phone back button returns to: the last linked crumb before the current page. */
export function parentCrumb(crumbs: Crumb[]): Crumb | undefined {
  const current = currentCrumbIndex(crumbs);
  const parents = current === -1 ? crumbs : crumbs.slice(0, current);
  return parents[parents.length - 1];
}

// Only a long label gives way, so "Albums" or "Edit" never lose letters to
// the title beside them.
const LONG_CRUMB = 24;
const shrink = (crumb: Crumb) => (crumb.label.length > LONG_CRUMB ? 1 : 0);

type BreadcrumbsProps = { crumbs: Crumb[] } & Omit<FlexProps, "children">;

/**
 * Trail of parents ending in the current page: mono, uppercase, muted. Parents
 * link; the current page, a last crumb with no link, is plain text marked
 * `aria-current`. Any of them truncates when the trail is long.
 */
export default function Breadcrumbs({ crumbs, ...rest }: BreadcrumbsProps) {
  const currentIndex = currentCrumbIndex(crumbs);

  return (
    <Flex
      as="nav"
      aria-label="Breadcrumb"
      alignItems="center"
      gap={2}
      mb={4}
      fontFamily="label"
      fontSize="12px"
      fontWeight="medium"
      letterSpacing="0.06em"
      textTransform="uppercase"
      color="fg.muted"
      minW={0}
      {...rest}
    >
      {crumbs.map((crumb, index) => (
        <React.Fragment key={`${index}-${crumb.label}`}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {index === currentIndex ? (
            <Text as="span" color="fg" lineClamp={1} flexShrink={shrink(crumb)} aria-current="page">
              {crumb.label}
            </Text>
          ) : crumb.href ? (
            // A long parent (a track title above its edit form) truncates
            // rather than widening the page.
            <Link
              as={NextLink}
              href={crumb.href}
              color="fg.muted"
              display="block"
              flexShrink={shrink(crumb)}
              truncate
              title={crumb.label}
            >
              {crumb.label}
            </Link>
          ) : (
            <Text as="span" flexShrink={0}>
              {crumb.label}
            </Text>
          )}
        </React.Fragment>
      ))}
    </Flex>
  );
}
