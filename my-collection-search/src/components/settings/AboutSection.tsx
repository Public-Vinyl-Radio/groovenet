"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Link, Text } from "@chakra-ui/react";
import { FiExternalLink } from "react-icons/fi";
import { MetaTag, StatusTag } from "@/components/ui/RoleTags";
import { useColorMode } from "@/components/ui/color-mode";
import { useUpdateInfo, useVersionInfo } from "@/hooks/useSystemInfo";

const SITE_URL = "https://groovenet.publicvinylradio.com";
const LINKS = [
  { label: "Website", href: SITE_URL },
  { label: "Documentation", href: `${SITE_URL}/docs/` },
  { label: "Source code", href: "https://github.com/Public-Vinyl-Radio/groovenet" },
];

export const ABOUT_TAGLINE = "Vinyl collection management for DJs.";

const linkRow = {
  align: "center",
  justify: "space-between",
  gap: 3,
  py: 3.5,
  fontSize: "md",
  fontWeight: "semibold",
  color: "fg",
  _hover: { bg: "bg.subtle", textDecoration: "none" },
} as const;

/** Settings → About GrooveNet (#971): the wordmark, version and where to find more. */
export default function AboutSection(): React.JSX.Element {
  const { colorMode } = useColorMode();
  const { data: version } = useVersionInfo();
  const { data: update } = useUpdateInfo();

  const updateChip = update?.updateAvailable ? (
    <StatusTag tone="success">
      Update available · {update.current} → {update.latest}
    </StatusTag>
  ) : update && !update.error ? (
    <StatusTag tone="neutral">Up to date</StatusTag>
  ) : null;

  return (
    <Flex direction="column" gap={6}>
      <Box>
        {/* The white wordmark is for dark palettes, the black one for light. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/groovenet-wordmark-${colorMode === "dark" ? "white" : "black"}.png`}
          alt="GrooveNet"
          width={240}
          height={45}
          style={{ maxWidth: "100%", height: "auto" }}
        />
        <Text mt={2} color="fg.muted" fontSize="md">
          {ABOUT_TAGLINE}
        </Text>
        <Flex mt={3} gap={2} align="center" flexWrap="wrap">
          {version ? <MetaTag>Version {version.version}</MetaTag> : null}
          {updateChip}
          {update?.updateAvailable && update.releaseUrl ? (
            <Link
              href={update.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              colorPalette="accent"
              color="colorPalette.fg"
              fontSize="sm"
              fontWeight="medium"
            >
              View release notes →
            </Link>
          ) : null}
        </Flex>
      </Box>

      <Box
        as="ul"
        listStyleType="none"
        borderWidth="outline"
        borderColor="border.ink"
        borderRadius="md"
        px={{ base: 4, md: 5 }}
      >
        {LINKS.map(({ label, href }, index) => (
          <Box as="li" key={label} borderTopWidth={index ? "rule" : 0} borderColor="border">
            <Link href={href} target="_blank" rel="noopener noreferrer" {...linkRow}>
              {label}
              <FiExternalLink aria-hidden />
            </Link>
          </Box>
        ))}
        <Box as="li" borderTopWidth="rule" borderColor="border">
          <Link asChild {...linkRow}>
            <NextLink href="/system">
              System status, backups and restore
              <span aria-hidden>→</span>
            </NextLink>
          </Link>
        </Box>
      </Box>
    </Flex>
  );
}
