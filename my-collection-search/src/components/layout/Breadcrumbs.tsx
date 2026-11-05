"use client";

import React from "react";
import NextLink from "next/link";
import { Flex, Link, Text, type FlexProps } from "@chakra-ui/react";

export type Crumb = {
  label: string;
  /** Parents link; the last crumb is the current page and needs none. */
  href?: string;
};

// Only a long label gives way, so "Albums" or "Edit" never lose letters to
// the title beside them.
const LONG_CRUMB = 24;
const shrink = (crumb: Crumb) => (crumb.label.length > LONG_CRUMB ? 1 : 0);

type BreadcrumbsProps = { crumbs: Crumb[] } & Omit<FlexProps, "children">;

/**
 * Trail of parents ending in the current page: mono, uppercase, muted. Parents
 * link; the last crumb is plain text. Any of them truncates when the trail is long.
 */
export default function Breadcrumbs({ crumbs, ...rest }: BreadcrumbsProps) {
  const lastIndex = crumbs.length - 1;

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
          {index === lastIndex ? (
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
