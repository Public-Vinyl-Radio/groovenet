"use client";

import React from "react";
import { Box, Flex, Heading, Link, Text } from "@chakra-ui/react";
import { StatusTag } from "@/components/ui/RoleTags";
import Image from "next/image";

import { useUpdateInfo } from "@/hooks/useSystemInfo";

const REPO_URL = "https://github.com/Public-Vinyl-Radio/groovenet";

const TECH_STACK = [
  "Next.js 16 · React 19 · TypeScript",
  "Chakra UI v3 · TanStack Query v5",
  "PostgreSQL (pgvector) + full-text search",
  "Essentia audio analysis (FastAPI)",
  "Genetic-algorithm playlist service (FastAPI)",
  "Redis-backed download worker (gamdl)",
];

export default function AboutSection(): React.JSX.Element {
  const { data: update } = useUpdateInfo();

  return (
    <Box>
      {/* Header: logo + name + tagline */}
      <Flex align="center" gap={4} mb={5}>
        <Image
          src="/groovenet-logo.png"
          alt="GrooveNet logo"
          width={56}
          height={56}
          style={{ borderRadius: 12 }}
        />
        <Box>
          <Heading size="lg" lineHeight={1.1}>
            GrooveNet
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            Vinyl collection management for DJs
          </Text>
        </Box>
      </Flex>

      {/* Description (from CLAUDE.md) */}
      <Text color="fg.muted" mb={6} maxW="60ch">
        A multi-service vinyl collection manager that combines a Next.js web app with Python
        microservices for audio analysis, downloads, and AI-powered playlist generation. Built for
        DJs to manage their Discogs collections with rich metadata from Apple Music, Spotify,
        YouTube, and audio analysis.
      </Text>

      {/* Update banner */}
      {update?.updateAvailable ? (
        <Box borderWidth={1} borderColor="border.success" borderRadius="lg" p={4} mb={6}>
          <Flex
            align={{ base: "flex-start", md: "center" }}
            justify="space-between"
            gap={3}
            flexWrap="wrap"
          >
            <Flex align="center" gap={3}>
              <StatusTag tone="success">Update available</StatusTag>
              <Text fontWeight="semibold" fontSize="sm">
                {update.current} → {update.latest}
              </Text>
            </Flex>
            {update.releaseUrl ? (
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
      ) : null}

      {/* Tech / services */}
      <Box mt={6}>
        <Heading size="sm" mb={2}>
          Built with
        </Heading>
        <Flex direction="column" gap={1}>
          {TECH_STACK.map((item) => (
            <Text key={item} fontSize="sm" color="fg.muted">
              {item}
            </Text>
          ))}
        </Flex>
      </Box>

      {/* Links */}
      <Box mt={6}>
        <Heading size="sm" mb={2}>
          Links
        </Heading>
        <Link
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          colorPalette="accent"
          color="colorPalette.fg"
          fontSize="sm"
        >
          GitHub — Public-Vinyl-Radio/groovenet
        </Link>
      </Box>
    </Box>
  );
}
