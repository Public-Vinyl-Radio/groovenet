"use client";

import React from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  SimpleGrid,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { LuPause, LuPlay, LuRefreshCw } from "react-icons/lu";
import PageContainer from "@/components/layout/PageContainer";
import {
  useIngestRetentionQuery,
  useIngestStatsQuery,
  useRecentDetectionsQuery,
} from "@/hooks/useVinylPipelineQuery";
import type { DetectionsRecentResponse } from "@/services/internalApi/vinylPipeline";

type DetectionWindow = DetectionsRecentResponse["detections"][number];

/** `47.2` -> `0:47`, which is how anyone thinks about a position in a track. */
function formatOffset(seconds: number | null): string {
  if (seconds === null) return "—";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const INGEST_STATUS_COLOR: Record<string, string> = {
  received: "blue",
  processing: "orange",
  processed: "green",
  failed: "red",
};

/**
 * One window as a table row.
 *
 * A no-match is rendered plainly rather than in red — it is the expected
 * state between tracks, and colouring it as an error trains you to ignore
 * red (mirrors the CLI's `formatDetection`).
 */
function DetectionRow({ detection }: { detection: DetectionWindow }) {
  if (!detection.matched) {
    return (
      <Table.Row>
        <Table.Cell whiteSpace="nowrap">{formatClock(detection.window_start_at)}</Table.Cell>
        <Table.Cell color="gray.500">no match</Table.Cell>
        <Table.Cell>—</Table.Cell>
        <Table.Cell>—</Table.Cell>
      </Table.Row>
    );
  }

  const confidence = detection.confidence ?? 0;
  const color = confidence >= 0.85 ? "green.600" : "yellow.600";

  return (
    <Table.Row>
      <Table.Cell whiteSpace="nowrap">{formatClock(detection.window_start_at)}</Table.Cell>
      <Table.Cell maxW="320px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {detection.artist ?? "?"} — {detection.title ?? "?"}
      </Table.Cell>
      <Table.Cell color={color} fontWeight="medium">{confidence.toFixed(3)}</Table.Cell>
      <Table.Cell whiteSpace="nowrap">{formatOffset(detection.offset_seconds)}</Table.Cell>
    </Table.Row>
  );
}

export default function VinylPipelineView() {
  const [minutes, setMinutes] = React.useState(60);
  const [sourceId, setSourceId] = React.useState("");
  const [live, setLive] = React.useState(true);
  const source = sourceId.trim() || undefined;

  const stats = useIngestStatsQuery(
    { minutes, source_id: source },
    { refetchInterval: live ? 15000 : false }
  );
  const detections = useRecentDetectionsQuery(
    { source_id: source, limit: 30 },
    { refetchInterval: live ? 5000 : false }
  );
  const retention = useIngestRetentionQuery({ refetchInterval: live ? 30000 : false });

  const s = stats.data;
  const rows = detections.data?.detections ?? [];

  return (
    <PageContainer size="wide">
      <Stack gap={{ base: 3, md: 6 }}>
        <Flex direction="column" gap={2}>
          <Flex justify="space-between" align="center" gap={2} wrap="wrap">
            <Heading size={{ base: "md", md: "lg" }}>Vinyl Pipeline</Heading>
            <Flex gap={2} align="center" wrap="wrap">
              <NativeSelectRoot size="sm" width="140px">
                <NativeSelectField
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  <option value={15}>Last 15m</option>
                  <option value={60}>Last hour</option>
                  <option value={360}>Last 6h</option>
                  <option value={1440}>Last 24h</option>
                </NativeSelectField>
              </NativeSelectRoot>
              <Input
                size="sm"
                width="180px"
                placeholder="Filter by source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLive((v) => !v)}
                aria-label={live ? "Pause live updates" : "Resume live updates"}
              >
                {live ? <LuPause /> : <LuPlay />}
                <Text display={{ base: "none", md: "inline" }}>{live ? "Live" : "Paused"}</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  stats.refetch();
                  detections.refetch();
                  retention.refetch();
                }}
                loading={stats.isFetching}
                aria-label="Refresh now"
              >
                <LuRefreshCw />
                <Text display={{ base: "none", md: "inline" }}>Refresh</Text>
              </Button>
            </Flex>
          </Flex>
          {stats.dataUpdatedAt > 0 && (
            <Text fontSize="xs" color="gray.500">
              Updated: {new Date(stats.dataUpdatedAt).toLocaleTimeString()}
            </Text>
          )}
        </Flex>

        {/* Index status — prominent, because zero here means nothing can ever match. */}
        {stats.isLoading ? (
          <Flex justify="center" py={4}><Spinner size="lg" /></Flex>
        ) : s ? (
          <Card.Root
            variant="outline"
            borderColor={!s.index.engine_registered || s.index.empty ? "red.400" : undefined}
          >
            <Card.Body>
              {s.ingest_writable === false && (
                <Text color="red.500" fontWeight="bold" mb={2}>
                  ✗ ingest volume is NOT writable — every upload will fail
                </Text>
              )}
              {!s.index.engine_registered ? (
                <Text color="red.500" fontWeight="bold" fontSize="lg">
                  ✗ No fingerprint engine registered — is fingerprint-service running?
                </Text>
              ) : s.index.empty ? (
                <Text color="red.500" fontWeight="bold" fontSize="lg">
                  ✗ Reference index is EMPTY — nothing can match
                </Text>
              ) : (
                <Text color="green.600" fontWeight="bold" fontSize="lg">
                  ✓ Index: {s.index.indexed_tracks} tracks ({s.index.fingerprint_type}{" "}
                  {s.index.fingerprint_version})
                </Text>
              )}
              {s.index.missing_fingerprint_tracks > 0 && (
                <Text color="yellow.600" fontSize="sm" mt={1}>
                  ⚠ {s.index.missing_fingerprint_tracks} track(s) have audio but no fingerprint
                </Text>
              )}
            </Card.Body>
          </Card.Root>
        ) : null}

        {/* Ingest health */}
        {s && (
          <Stack gap={3}>
            <SimpleGrid columns={{ base: 2, md: 5 }} gap={4}>
              {(["received", "processing", "processed", "failed"] as const).map((status) => (
                <Card.Root key={status}>
                  <Card.Body textAlign="center" py={4}>
                    <Text fontSize="2xl" fontWeight="bold" color={`${INGEST_STATUS_COLOR[status]}.500`}>
                      {s.ingests.by_status[status] ?? 0}
                    </Text>
                    <Text fontSize="sm" color="gray.500" textTransform="capitalize">{status}</Text>
                  </Card.Body>
                </Card.Root>
              ))}
              <Card.Root>
                <Card.Body textAlign="center" py={4}>
                  <Text fontSize="2xl" fontWeight="bold" color={s.queue_depth === null ? "gray.400" : undefined}>
                    {s.queue_depth === null ? "?" : s.queue_depth}
                  </Text>
                  <Text fontSize="sm" color="gray.500">Queue depth</Text>
                </Card.Body>
              </Card.Root>
            </SimpleGrid>

            <Flex gap={4} wrap="wrap" fontSize="sm" color="gray.600">
              {retention.data && (
                <Text>
                  Volume: {formatBytes(retention.data.bytes)} across {retention.data.files} file(s)
                  {retention.data.lastSweptAt
                    ? ` · last swept ${formatClock(retention.data.lastSweptAt)}`
                    : " · never swept"}
                </Text>
              )}
              {s.ingests.oldest_in_flight && (
                <Text color="yellow.600">
                  Oldest in flight: {s.ingests.oldest_in_flight.status} since{" "}
                  {formatClock(s.ingests.oldest_in_flight.received_at)}
                </Text>
              )}
              {s.spins.pending !== null && s.spins.pending > 0 && (
                <Text color="yellow.600">
                  {s.spins.pending} detection(s) awaiting a spin session
                </Text>
              )}
            </Flex>

            {s.ingests.failures.length > 0 && (
              <Box>
                {s.ingests.failures.map((f) => (
                  <Flex key={f.error} gap={2} fontSize="sm" color="red.500">
                    <Badge colorScheme="red" variant="subtle">{f.count}×</Badge>
                    <Text>{f.error}</Text>
                  </Flex>
                ))}
              </Box>
            )}
          </Stack>
        )}

        {/* Detections timeline — the main thing you watch while a record plays. */}
        <Box>
          <Heading size="sm" mb={2}>Recent detections</Heading>
          {detections.isLoading ? (
            <Flex justify="center" py={4}><Spinner size="lg" /></Flex>
          ) : rows.length === 0 ? (
            <Text color="gray.500">No detections in this window.</Text>
          ) : (
            <Box overflowX="auto">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader width="100px">Time</Table.ColumnHeader>
                    <Table.ColumnHeader minW="240px">Track</Table.ColumnHeader>
                    <Table.ColumnHeader width="90px">Conf</Table.ColumnHeader>
                    <Table.ColumnHeader width="70px">At</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((detection) => (
                    <DetectionRow key={detection.id} detection={detection} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          )}
        </Box>
      </Stack>
    </PageContainer>
  );
}
