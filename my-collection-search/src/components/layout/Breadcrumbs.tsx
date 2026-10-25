"use client";

import React from "react";
import NextLink from "next/link";
import { Flex, Link, Text, type FlexProps } from "@chakra-ui/react";

export type Crumb = {
  label: string;
  /** Parents link; the last crumb is the current page and needs none. */
  href?: string;
};

type BreadcrumbsProps = { crumbs: Crumb[] } & Omit<FlexProps, "children">;

/**
 * Trail of parents ending in the current page: mono, uppercase, muted. Parents
 * link; the last crumb is plain text and truncates.
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
            <Text as="span" color="fg" lineClamp={1} aria-current="page">
              {crumb.label}
            </Text>
          ) : crumb.href ? (
            <Link as={NextLink} href={crumb.href} color="fg.muted" flexShrink={0}>
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
