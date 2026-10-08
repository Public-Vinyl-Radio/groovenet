// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({
  fetchEmbeddingQueueStatus: vi.fn(),
  retryFailedEmbeddingJobs: vi.fn(),
}));
vi.mock("@/services/internalApi/embeddingQueue", () => api);

import {
  useEmbeddingQueueQuery,
  useRetryFailedEmbeddingJobsMutation,
} from "./useEmbeddingQueueQuery";
import type { EmbeddingQueueStatusResponse } from "@/services/internalApi/embeddingQueue";

const STATUS: EmbeddingQueueStatusResponse = {
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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

beforeEach(() => vi.resetAllMocks());

describe("useEmbeddingQueueQuery", () => {
  it("fetches and returns the queue status", async () => {
    api.fetchEmbeddingQueueStatus.mockResolvedValue(STATUS);
    const { wrapper } = setup();
    const { result } = renderHook(() => useEmbeddingQueueQuery({ refetchInterval: false }), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(STATUS));
  });

  it("defaults to enabled with a 15s poll when no options are given", async () => {
    api.fetchEmbeddingQueueStatus.mockResolvedValue(STATUS);
    const { wrapper } = setup();
    const { result } = renderHook(() => useEmbeddingQueueQuery(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(STATUS));
  });

  it("does not fetch while disabled", async () => {
    api.fetchEmbeddingQueueStatus.mockResolvedValue(STATUS);
    const { wrapper } = setup();
    renderHook(() => useEmbeddingQueueQuery({ enabled: false, refetchInterval: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.fetchEmbeddingQueueStatus).not.toHaveBeenCalled();
  });
});

describe("useRetryFailedEmbeddingJobsMutation", () => {
  it("retries the given ids and invalidates the queue status query", async () => {
    api.retryFailedEmbeddingJobs.mockResolvedValue({ retried: ["a"], not_found: [] });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRetryFailedEmbeddingJobsMutation(), { wrapper });

    const response = await result.current.mutateAsync(["a"]);

    expect(response).toEqual({ retried: ["a"], not_found: [] });
    expect(api.retryFailedEmbeddingJobs).toHaveBeenCalledWith(["a"], expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.embeddingQueue() });
  });
});
