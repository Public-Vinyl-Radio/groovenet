"use client";

import React from "react";
import { Box, Flex, Heading, type FlexProps } from "@chakra-ui/react";

// Pieces the recap strip on the log (#863) and the recap page (#865) share.

/** Ink mixed into the ground, so a tint follows the palette in both modes. */
export const inkTint = (percent: number) =>
  `color-mix(in srgb, var(--gn-ink) ${percent}%, var(--gn-ground))`;
export const DIGITAL_HATCH =
  "repeating-linear-gradient(135deg, var(--gn-ink) 0 2px, transparent 2px 7px)";

export function Overline({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Heading
      as="h3"
      id={id}
      fontFamily="mono"
      fontSize={{ base: "10px", md: "xs" }}
      fontWeight="semibold"
      letterSpacing="0.08em"
    >
      {children}
    </Heading>
  );
}

/** A section's ink label strip and the rule that runs off it: "GENRE MIX ━━━". */
export function SectionHeading({
  id,
  children,
  trailing,
  ...rest
}: { id?: string; children: React.ReactNode; trailing?: React.ReactNode } & Omit<
  FlexProps,
  "children"
>) {
  return (
    <Flex align="center" gap={3} {...rest}>
      <Heading
        as="h2"
        id={id}
        h="26px"
        px={2.5}
        display="flex"
        alignItems="center"
        bg="fg"
        color="bg"
        fontFamily="mono"
        fontSize="xs"
        fontWeight="semibold"
        letterSpacing="0.08em"
        flexShrink={0}
      >
        {children}
      </Heading>
      <Box flex="1" h="2px" bg="fg" aria-hidden="true" />
      {trailing}
    </Flex>
  );
}

/** An outlined horizontal bar, named for screen readers with its numbers. */
export function Bar({
  label,
  children,
  ...rest
}: { label: string; children: React.ReactNode } & Omit<FlexProps, "children">) {
  return (
    <Flex
      role="img"
      aria-label={label}
      h={{ base: "20px", md: "24px" }}
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow={{ base: "none", md: "sm" }}
      overflow="hidden"
      {...rest}
    >
      {children}
    </Flex>
  );
}

export function Swatch({ bg, size = "10px" }: { bg: string; size?: string }) {
  return (
    <Box
      as="span"
      aria-hidden="true"
      display="inline-block"
      boxSize={size}
      flexShrink={0}
      borderWidth="outline"
      borderColor="border.ink"
      style={{ background: bg }}
    />
  );
}

/** Vinyl solid, digital hatched, each only when it has spins. */
export function SplitSegments({ vinyl, digital }: { vinyl: number; digital: number }) {
  return (
    <>
      {vinyl > 0 && (
        <Box
          flex={vinyl}
          bg="fg"
          borderRightWidth={digital > 0 ? "outline" : 0}
          borderColor="border.ink"
        />
      )}
      {digital > 0 && <Box flex={digital} style={{ background: DIGITAL_HATCH }} />}
    </>
  );
}
