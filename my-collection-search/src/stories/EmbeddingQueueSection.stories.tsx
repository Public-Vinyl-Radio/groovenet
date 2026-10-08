import React from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@chakra-ui/react';
import EmbeddingQueueSection from '@/components/jobs/EmbeddingQueueSection';
import { queryKeys } from '@/lib/queryKeys';
import type { EmbeddingQueueStatusResponse } from '@/services/internalApi/embeddingQueue';

// Seeds the query cache directly so the story needs no network, and disables
// polling — the hook's refetchInterval would otherwise fire a real fetch()
// against a route Storybook never serves.
function SeededQueries({
  status,
  children,
}: {
  status: EmbeddingQueueStatusResponse;
  children: React.ReactNode;
}) {
  const [client] = React.useState(() => {
    const seeded = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
    });
    seeded.setQueryData(queryKeys.embeddingQueue(), status);
    return seeded;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const EMPTY: EmbeddingQueueStatusResponse = {
  lanes: { interactive: 0, sync: 0, bulk: 0 },
  retrying: 0,
  failed_count: 0,
  paused: false,
  interval_seconds: 10,
  batch_size: 100,
  drain_rate_per_minute: 600,
  eta_seconds: 0,
  by_kind: { identity: 0, audio_vibe: 0, context: 0 },
  by_kind_sampled: false,
  active_backfill_runs: [],
  failed: [],
};

// The #450/#451 motivating case: a 20,561-job re-embed backlog draining at
// 30 jobs/min, with one backfill run in progress and the kind breakdown
// sampled rather than exact.
const BUSY: EmbeddingQueueStatusResponse = {
  lanes: { interactive: 2, sync: 5, bulk: 20554 },
  retrying: 12,
  failed_count: 0,
  paused: false,
  interval_seconds: 10,
  batch_size: 5,
  drain_rate_per_minute: 30,
  eta_seconds: 41_146,
  by_kind: { identity: 310, audio_vibe: 150, context: 40 },
  by_kind_sampled: true,
  active_backfill_runs: [
    {
      run_id: "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      queued: 20561,
      success: 8900,
      skipped: 1200,
      failed: 3,
      started_at: Date.now() - 45 * 60_000,
      updated_at: Date.now() - 5_000,
    },
  ],
  failed: [],
};

const PAUSED: EmbeddingQueueStatusResponse = {
  lanes: { interactive: 1, sync: 3, bulk: 847 },
  retrying: 0,
  failed_count: 0,
  paused: true,
  pause_reason:
    "You do not have access to the organization tied to the API key (invalid_organization)",
  last_error:
    "You do not have access to the organization tied to the API key (invalid_organization)",
  interval_seconds: 10,
  batch_size: 100,
  drain_rate_per_minute: 0,
  eta_seconds: null,
  by_kind: { identity: 600, audio_vibe: 200, context: 48 },
  by_kind_sampled: false,
  active_backfill_runs: [],
  failed: [],
};

const WITH_FAILURES: EmbeddingQueueStatusResponse = {
  lanes: { interactive: 0, sync: 1, bulk: 14 },
  retrying: 2,
  failed_count: 4,
  paused: false,
  last_error: "503 Service Unavailable",
  interval_seconds: 10,
  batch_size: 100,
  drain_rate_per_minute: 600,
  eta_seconds: 2,
  by_kind: { identity: 10, audio_vibe: 3, context: 2 },
  by_kind_sampled: false,
  active_backfill_runs: [],
  failed: [
    {
      id: "a1b2c3d4e5f6",
      track_id: "33416876-A1",
      friend_id: 6,
      kind: "identity",
      attempts: 5,
      error: "503 Service Unavailable",
      failed_at: Date.now() - 2 * 60_000,
    },
    {
      id: "b2c3d4e5f6a1",
      track_id: "33416876-A2",
      friend_id: 6,
      kind: "audio_vibe",
      attempts: 5,
      error: "ECONNRESET",
      failed_at: Date.now() - 20 * 60_000,
    },
    {
      id: "c3d4e5f6a1b2",
      track_id: "33416876-D1",
      friend_id: 6,
      kind: "context",
      run_id: "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      attempts: 5,
      error: "Request timed out after 30000ms",
      failed_at: Date.now() - 60 * 60_000,
    },
    {
      id: "d4e5f6a1b2c3",
      track_id: "33416876-D2",
      friend_id: 6,
      kind: "identity",
      attempts: 5,
      error: "500 Internal Server Error",
      failed_at: Date.now() - 90 * 60_000,
    },
  ],
};

const meta: Meta<typeof EmbeddingQueueSection> = {
  title: 'Jobs/EmbeddingQueueSection',
  component: EmbeddingQueueSection,
  parameters: { layout: 'padded' },
  args: {
    refetchInterval: false,
  },
  decorators: [
    (Story) => (
      <Box maxW="900px" mx="auto">
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EmbeddingQueueSection>;

export const Empty: Story = {
  name: 'Empty — nothing queued',
  decorators: [
    (Story) => (
      <SeededQueries status={EMPTY}>
        <Story />
      </SeededQueries>
    ),
  ],
};

export const Busy: Story = {
  name: 'Busy — large backfill draining',
  decorators: [
    (Story) => (
      <SeededQueries status={BUSY}>
        <Story />
      </SeededQueries>
    ),
  ],
};

export const Paused: Story = {
  name: 'Paused — auth error',
  decorators: [
    (Story) => (
      <SeededQueries status={PAUSED}>
        <Story />
      </SeededQueries>
    ),
  ],
};

export const WithFailures: Story = {
  name: 'With failures — retry available',
  decorators: [
    (Story) => (
      <SeededQueries status={WITH_FAILURES}>
        <Story />
      </SeededQueries>
    ),
  ],
};
