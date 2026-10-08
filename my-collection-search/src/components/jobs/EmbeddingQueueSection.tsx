"use client";

import React from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Heading,
  Link,
  Progress,
  SimpleGrid,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { LuRefreshCw } from "react-icons/lu";
import {
  useEmbeddingQueueQuery,
  useRetryFailedEmbeddingJobsMutation,
} from "@/hooks/useEmbeddingQueueQuery";
import { toaster } from "@/components/ui/toaster";
import type { EmbeddingQueueStatusResponse } from "@/services/internalApi/embeddingQueue";

function formatEta(seconds: number | null): string {
  if (seconds === null) return "unknown";
  if (seconds === 0) return "caught up";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `~${hours}h`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString();
}

function trackHref(trackId: string, friendId: number): string {
  return `/tracks/${encodeURIComponent(trackId)}?friend_id=${friendId}`;
}

const KIND_LABEL: Record<string, string> = {
  identity: "Identity",
  audio_vibe: "Audio vibe",
  context: "Context",
};

export default function EmbeddingQueueSection({
  refetchInterval,
}: {
  /** Override for stories/tests — production leaves this at the hook's default poll. */
  refetchInterval?: number | false;
} = {}) {
  const { data, isLoading, refetch, dataUpdatedAt } = useEmbeddingQueueQuery({ refetchInterval });
  const retryMutation = useRetryFailedEmbeddingJobsMutation();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const failed = React.useMemo(() => data?.failed ?? [], [data]);

  React.useEffect(() => {
    // Drop any selection whose entry fell off the list (retried elsewhere, or trimmed).
    setSelected((prev) => {
      const ids = new Set(failed.map((job) => job.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [failed]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === failed.length ? new Set() : new Set(failed.map((j) => j.id))));
  };

  const retrySelected = async (ids: string[]) => {
    try {
      const result = await retryMutation.mutateAsync(ids);
      toaster.create({
        title: `Retried ${result.retried.length} job${result.retried.length === 1 ? "" : "s"}`,
        description:
          result.not_found.length > 0
            ? `${result.not_found.length} entr${result.not_found.length === 1 ? "y" : "ies"} were no longer in the failed list.`
            : undefined,
        type: "success",
      });
      setSelected(new Set());
    } catch (err) {
      toaster.create({
        title: "Retry failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  };

  if (isLoading && !data) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="lg" />
        <Text mt={4}>Loading embedding queue...</Text>
      </Box>
    );
  }

  if (!data) return null;

  return (
    <Stack gap={{ base: 3, md: 4 }}>
      <Flex direction="column" gap={2}>
        <Flex justify="space-between" align="center" gap={2}>
          <Heading size={{ base: "sm", md: "md" }}>Embeddings</Heading>
          <Button
            onClick={() => refetch()}
            loading={isLoading}
            variant="outline"
            aria-label="Refresh embedding queue"
            size="sm"
          >
            <LuRefreshCw />
            <Text display={{ base: "none", md: "inline" }}>Refresh</Text>
          </Button>
        </Flex>
        {dataUpdatedAt > 0 && (
          <Text fontSize="xs" color="gray.500">
            Updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Text>
        )}
      </Flex>

      {data.paused && (
        <Card.Root borderColor="red.400" borderWidth="1px">
          <Card.Body py={3}>
            <Flex gap={2} align="center" flexWrap="wrap">
              <Badge colorScheme="red" variant="solid">Paused</Badge>
              <Text fontSize="sm" color="red.600">{data.pause_reason}</Text>
            </Flex>
          </Card.Body>
        </Card.Root>
      )}

      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        <SummaryStat label="Interactive" value={data.lanes.interactive} />
        <SummaryStat label="Sync" value={data.lanes.sync} />
        <SummaryStat label="Bulk" value={data.lanes.bulk} />
        <SummaryStat label="Retrying" value={data.retrying} color="orange.500" />
        <SummaryStat label="Failed" value={data.failed_count} color={data.failed_count > 0 ? "red.500" : undefined} />
        <SummaryStat label="Drain rate" value={`${Math.round(data.drain_rate_per_minute)}/min`} isText />
        <SummaryStat label="ETA" value={formatEta(data.eta_seconds)} isText />
        <SummaryStat
          label="By kind"
          value={`I:${data.by_kind.identity} A:${data.by_kind.audio_vibe} C:${data.by_kind.context}${data.by_kind_sampled ? " (sampled)" : ""}`}
          isText
        />
      </SimpleGrid>

      {!data.paused && data.last_error && (
        <Text fontSize="xs" color="gray.500">Last error: {data.last_error}</Text>
      )}

      {data.active_backfill_runs.length > 0 && (
        <Card.Root>
          <Card.Body>
            <Heading size="sm" mb={3}>Active backfill runs</Heading>
            <Stack gap={3}>
              {data.active_backfill_runs.map((run) => {
                const done = run.success + run.skipped + run.failed;
                const pct = run.queued > 0 ? Math.round((done / run.queued) * 100) : 0;
                return (
                  <Box key={run.run_id}>
                    <Flex justify="space-between" fontSize="sm" mb={1}>
                      <Text fontFamily="mono">{run.run_id.slice(0, 8)}</Text>
                      <Text color="gray.600">
                        {done} / {run.queued} ({pct}%)
                      </Text>
                    </Flex>
                    <Progress.Root value={pct} size="sm">
                      <Progress.Track>
                        <Progress.Range />
                      </Progress.Track>
                    </Progress.Root>
                    <Flex gap={3} fontSize="xs" color="gray.500" mt={1}>
                      <Text>Success: {run.success}</Text>
                      <Text>Skipped: {run.skipped}</Text>
                      <Text>Failed: {run.failed}</Text>
                    </Flex>
                  </Box>
                );
              })}
            </Stack>
          </Card.Body>
        </Card.Root>
      )}

      {failed.length === 0 ? (
        <Text fontSize="sm" color="gray.500">No failed embedding jobs.</Text>
      ) : (
        <Card.Root>
          <Card.Body>
            <Flex justify="space-between" align="center" mb={3}>
              <Heading size="sm">Failed jobs ({failed.length})</Heading>
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                disabled={selected.size === 0 || retryMutation.isPending}
                loading={retryMutation.isPending}
                onClick={() => retrySelected([...selected])}
              >
                Retry selected ({selected.size})
              </Button>
            </Flex>
            <Box overflowX="auto">
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader width="40px">
                      <Checkbox.Root
                        checked={selected.size === failed.length}
                        onCheckedChange={toggleAll}
                        aria-label="Select all failed jobs"
                      >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                      </Checkbox.Root>
                    </Table.ColumnHeader>
                    <Table.ColumnHeader>Track</Table.ColumnHeader>
                    <Table.ColumnHeader>Kind</Table.ColumnHeader>
                    <Table.ColumnHeader>Attempts</Table.ColumnHeader>
                    <Table.ColumnHeader>Error</Table.ColumnHeader>
                    <Table.ColumnHeader>Failed at</Table.ColumnHeader>
                    <Table.ColumnHeader></Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {failed.map((job) => (
                    <Table.Row key={job.id}>
                      <Table.Cell>
                        <Checkbox.Root
                          checked={selected.has(job.id)}
                          onCheckedChange={() => toggleOne(job.id)}
                          aria-label={`Select ${job.track_id}`}
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control />
                        </Checkbox.Root>
                      </Table.Cell>
                      <Table.Cell>
                        <Link as={NextLink} href={trackHref(job.track_id, job.friend_id)} _hover={{ textDecoration: "underline" }}>
                          {job.track_id}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="outline" size="sm">{KIND_LABEL[job.kind] ?? job.kind}</Badge>
                      </Table.Cell>
                      <Table.Cell>{job.attempts}</Table.Cell>
                      <Table.Cell maxW="320px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={job.error}>
                        {job.error}
                      </Table.Cell>
                      <Table.Cell whiteSpace="nowrap" color="gray.600" fontSize="xs">
                        {formatTimestamp(job.failed_at)}
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          size="xs"
                          variant="ghost"
                          loading={retryMutation.isPending}
                          onClick={() => retrySelected([job.id])}
                        >
                          Retry
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Card.Body>
        </Card.Root>
      )}
    </Stack>
  );
}

function SummaryStat({
  label,
  value,
  color,
  isText,
}: {
  label: string;
  value: number | string;
  color?: string;
  isText?: boolean;
}) {
  return (
    <Card.Root>
      <Card.Body textAlign="center" py={4}>
        <Text fontSize={isText ? "md" : "xl"} fontWeight="bold" color={color}>
          {value}
        </Text>
        <Text fontSize="xs" color="gray.500">{label}</Text>
      </Card.Body>
    </Card.Root>
  );
}

export type { EmbeddingQueueStatusResponse };
