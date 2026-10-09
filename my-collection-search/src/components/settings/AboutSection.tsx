"use client";

import React from "react";
import {
  Badge,
  Box,
  Flex,
  Heading,
  Link,
  SimpleGrid,
  Spinner,
  Text,
} from "@chakra-ui/react";
import Image from "next/image";

import {
  useStatusInfo,
  useUpdateInfo,
  useVersionInfo,
} from "@/hooks/useSystemInfo";
import type { ServiceStatus } from "@/services/internalApi/system";

const REPO_URL = "https://github.com/Public-Vinyl-Radio/groovenet";

const TECH_STACK = [
  "Next.js 16 · React 19 · TypeScript",
  "Chakra UI v3 · TanStack Query v5",
  "PostgreSQL (pgvector) + full-text search",
  "Essentia audio analysis (FastAPI)",
  "Genetic-algorithm playlist service (FastAPI)",
  "Redis-backed download worker (gamdl)",
];

function statusColor(status: ServiceStatus): string {
  switch (status) {
    case "up":
      return "green";
    case "down":
      return "red";
    default:
      return "gray";
  }
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Flex justify="space-between" gap={4} py={1.5}>
      <Text color="fg.muted" fontSize="sm">
        {label}
      </Text>
      <Box fontSize="sm" fontWeight="medium" textAlign="right" wordBreak="break-all">
        {children}
      </Box>
    </Flex>
  );
}

export default function AboutSection(): React.JSX.Element {
  const { data: version, isLoading: versionLoading } = useVersionInfo();
  const { data: status, isLoading: statusLoading } = useStatusInfo();
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
        A multi-service vinyl collection manager that combines a Next.js web app
        with Python microservices for audio analysis, downloads, and AI-powered
        playlist generation. Built for DJs to manage their Discogs collections
        with rich metadata from Apple Music, Spotify, YouTube, and audio analysis.
      </Text>

      {/* Update banner */}
      {update?.updateAvailable ? (
        <Box borderWidth={1} borderColor="green.400" borderRadius="lg" p={4} mb={6}>
          <Flex
            align={{ base: "flex-start", md: "center" }}
            justify="space-between"
            gap={3}
            flexWrap="wrap"
          >
            <Flex align="center" gap={3}>
              <Badge colorPalette="green" variant="solid">
                Update available
              </Badge>
              <Text fontWeight="semibold" fontSize="sm">
                {update.current} → {update.latest}
              </Text>
            </Flex>
            {update.releaseUrl ? (
              <Link
                href={update.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                colorPalette="blue"
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

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={6}>
        {/* Build info */}
        <Box borderWidth={1} borderRadius="lg" p={4}>
          <Heading size="sm" mb={3}>
            Build
          </Heading>
          {versionLoading ? (
            <Spinner size="sm" />
          ) : (
            <>
              <InfoRow label="Version">{version?.version ?? "unknown"}</InfoRow>
              <InfoRow label="Commit">
                {version?.gitSha ? (
                  <Link
                    href={`${REPO_URL}/commit/${version.gitSha}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    colorPalette="blue"
                    color="colorPalette.fg"
                  >
                    {version.gitSha}
                  </Link>
                ) : (
                  "—"
                )}
              </InfoRow>
              <InfoRow label="Built">
                {version?.builtAt
                  ? new Date(version.builtAt).toLocaleString()
                  : "—"}
              </InfoRow>
              <InfoRow label="Environment">
                {version?.nodeEnv ?? "—"}
              </InfoRow>
              <InfoRow label="Updates">
                {!update ? (
                  "—"
                ) : update.updateAvailable ? (
                  <Text as="span" color="green.500" fontWeight="semibold">
                    {update.latest} available
                  </Text>
                ) : !update.comparable ? (
                  <Text as="span" color="fg.muted">
                    n/a (dev build)
                  </Text>
                ) : update.error ? (
                  <Text as="span" color="fg.muted">
                    unavailable
                  </Text>
                ) : (
                  <Text as="span" color="green.500">
                    up to date
                  </Text>
                )}
              </InfoRow>
            </>
          )}
        </Box>

        {/* Service health */}
        <Box borderWidth={1} borderRadius="lg" p={4}>
          <Heading size="sm" mb={3}>
            Services
          </Heading>
          {statusLoading ? (
            <Spinner size="sm" />
          ) : (
            (status?.services ?? []).map((svc) => (
              <Box key={svc.service} py={1.5}>
                <Flex justify="space-between" align="center">
                  <Text fontSize="sm" fontWeight="medium">
                    {svc.service}
                  </Text>
                  <Flex align="center" gap={2}>
                    {svc.latencyMs != null && svc.status === "up" ? (
                      <Text fontSize="xs" color="fg.muted">
                        {svc.latencyMs}ms
                      </Text>
                    ) : null}
                    <Badge colorPalette={statusColor(svc.status)} variant="subtle">
                      {svc.status}
                    </Badge>
                  </Flex>
                </Flex>
                {svc.detail ? (
                  <Text fontSize="xs" color="fg.muted">
                    {svc.detail}
                  </Text>
                ) : null}
              </Box>
            ))
          )}
        </Box>
      </SimpleGrid>

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
          colorPalette="blue"
          color="colorPalette.fg"
          fontSize="sm"
        >
          GitHub — Public-Vinyl-Radio/groovenet
        </Link>
      </Box>
    </Box>
  );
}
