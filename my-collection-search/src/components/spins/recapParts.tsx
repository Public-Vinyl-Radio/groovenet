"use client";

import React from "react";
import { Box, Flex, type FlexProps } from "@chakra-ui/react";

// Pieces the recap strip on the log (#863) and the recap page (#865) share.

/** Ink mixed into the ground, so a tint follows the palette in both modes. */
export const inkTint = (percent: number) =>
  `color-mix(in srgb, var(--gn-ink) ${percent}%, var(--gn-ground))`;
export const DIGITAL_HATCH =
  "repeating-linear-gradient(135deg, var(--gn-ink) 0 2px, transparent 2px 7px)";

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
      borderRadius="md"
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
      borderRadius="md"
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
