// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { EmbeddingQueueStatusResponse } from "@/services/internalApi/embeddingQueue";

const api = vi.hoisted(() => ({
  fetchEmbeddingQueueStatus: vi.fn(),
  retryFailedEmbeddingJobs: vi.fn(),
}));
vi.mock("@/services/internalApi/embeddingQueue", () => api);

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import EmbeddingQueueSection from "./EmbeddingQueueSection";

const BASE: EmbeddingQueueStatusResponse = {
  lanes: { interactive: 2, sync: 3, bulk: 4 },
  retrying: 5,
  failed_count: 0,
  paused: false,
  interval_seconds: 10,
  batch_size: 100,
  drain_rate_per_minute: 600,
  eta_seconds: 0,
  by_kind: { identity: 1, audio_vibe: 2, context: 3 },
  by_kind_sampled: false,
  active_backfill_runs: [],
  failed: [],
};

function failedJob(overrides: Partial<EmbeddingQueueStatusResponse["failed"][number]> = {}) {
  return {
    id: "aaaaaaaaaaaa",
    track_id: "track-1",
    friend_id: 6,
    kind: "identity" as const,
    attempts: 5,
    error: "503 Service Unavailable",
    failed_at: 1_700_000_000_000,
    ...overrides,
  };
}

afterEach(() => vi.resetAllMocks());

async function renderSection(status: EmbeddingQueueStatusResponse) {
  api.fetchEmbeddingQueueStatus.mockResolvedValue(status);
  const result = renderWithProviders(<EmbeddingQueueSection refetchInterval={false} />);
  await screen.findByText("Embeddings");
  await waitFor(() => expect(screen.queryByText("Loading embedding queue...")).toBeNull());
  return result;
}

describe("EmbeddingQueueSection", () => {
  it("renders lane depths and retrying from the queue status", async () => {
    await renderSection(BASE);

    expect(screen.getByText("2")).toBeTruthy(); // interactive
    expect(screen.getByText("3")).toBeTruthy(); // sync
    expect(screen.getByText("4")).toBeTruthy(); // bulk
    expect(screen.getByText("5")).toBeTruthy(); // retrying
    expect(screen.getByText("No failed embedding jobs.")).toBeTruthy();
  });

  it("shows the pause banner with its reason", async () => {
    await renderSection({
      ...BASE,
      paused: true,
      pause_reason: "invalid_organization",
      drain_rate_per_minute: 0,
      eta_seconds: null,
    });

    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("invalid_organization")).toBeTruthy();
  });

  it("shows active backfill run progress", async () => {
    await renderSection({
      ...BASE,
      active_backfill_runs: [
        {
          run_id: "a1b2c3d4-0000-0000-0000-000000000000",
          queued: 10,
          success: 4,
          skipped: 1,
          failed: 0,
          started_at: Date.now() - 1000,
          updated_at: Date.now(),
        },
      ],
    });

    expect(screen.getByText("Active backfill runs")).toBeTruthy();
    expect(screen.getByText("5 / 10 (50%)")).toBeTruthy();
  });

  it("lists failed jobs with a link to the track", async () => {
    await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    expect(screen.getByText("Failed jobs (1)")).toBeTruthy();
    const link = screen.getByRole("link", { name: "track-1" });
    expect(link.getAttribute("href")).toBe("/tracks/track-1?friend_id=6");
    expect(screen.getByText("503 Service Unavailable")).toBeTruthy();
  });

  it("retries a single failed job via its row action and shows a success toast", async () => {
    api.retryFailedEmbeddingJobs.mockResolvedValue({ retried: ["aaaaaaaaaaaa"], not_found: [] });
    const { user } = await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const row = screen.getByText("track-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(api.retryFailedEmbeddingJobs).toHaveBeenCalledWith(["aaaaaaaaaaaa"], expect.anything())
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Retried 1 job" }));
  });

  it("retries every selected job via select-all and the bulk action", async () => {
    api.retryFailedEmbeddingJobs.mockResolvedValue({ retried: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], not_found: [] });
    const { user } = await renderSection({
      ...BASE,
      failed_count: 2,
      failed: [failedJob(), failedJob({ id: "bbbbbbbbbbbb", track_id: "track-2" })],
    });

    await user.click(screen.getByRole("checkbox", { name: "Select all failed jobs" }));
    await user.click(screen.getByRole("button", { name: /Retry selected \(2\)/ }));

    await waitFor(() =>
      expect(api.retryFailedEmbeddingJobs).toHaveBeenCalledWith(
        ["aaaaaaaaaaaa", "bbbbbbbbbbbb"],
        expect.anything()
      )
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Retried 2 jobs" }));
  });

  it("shows an error toast when the retry request fails", async () => {
    api.retryFailedEmbeddingJobs.mockRejectedValue(new Error("redis is gone"));
    const { user } = await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const row = screen.getByText("track-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Retry failed", description: "redis is gone" })
      )
    );
  });

  it("disables the bulk retry action until a job is selected", async () => {
    await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const button = screen.getByRole("button", { name: /Retry selected \(0\)/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows a loading spinner before the first response arrives", async () => {
    let resolveFetch!: (status: EmbeddingQueueStatusResponse) => void;
    api.fetchEmbeddingQueueStatus.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    renderWithProviders(<EmbeddingQueueSection refetchInterval={false} />);
    expect(screen.getByText("Loading embedding queue...")).toBeTruthy();

    resolveFetch(BASE);
    await waitFor(() => expect(screen.queryByText("Loading embedding queue...")).toBeNull());
    expect(screen.getByText("Embeddings")).toBeTruthy();
  });

  it("renders nothing once loading settles with no data (fetch failed, nothing cached)", async () => {
    api.fetchEmbeddingQueueStatus.mockRejectedValue(new Error("redis is gone"));
    const { container } = renderWithProviders(<EmbeddingQueueSection refetchInterval={false} />);

    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("notes when an id requested for retry was no longer in the failed list", async () => {
    api.retryFailedEmbeddingJobs.mockResolvedValue({ retried: [], not_found: ["aaaaaaaaaaaa"] });
    const { user } = await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const row = screen.getByText("track-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Retried 0 jobs",
          description: "1 entry were no longer in the failed list.",
        })
      )
    );
  });

  it("pluralizes the not-found note for more than one stale id", async () => {
    api.retryFailedEmbeddingJobs.mockResolvedValue({ retried: [], not_found: ["a", "b"] });
    const { user } = await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const row = screen.getByText("track-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "2 entries were no longer in the failed list." })
      )
    );
  });

  it("stringifies a non-Error retry rejection for the toast description", async () => {
    api.retryFailedEmbeddingJobs.mockRejectedValue("redis is gone");
    const { user } = await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob()],
    });

    const row = screen.getByText("track-1").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Retry failed", description: "redis is gone" })
      )
    );
  });

  it("marks the by-kind breakdown as sampled when the queue flags it", async () => {
    await renderSection({ ...BASE, by_kind_sampled: true });
    expect(screen.getByText("I:1 A:2 C:3 (sampled)")).toBeTruthy();
  });

  it("shows the last error even while not paused", async () => {
    await renderSection({ ...BASE, last_error: "503 once, then recovered" });
    expect(screen.getByText("Last error: 503 once, then recovered")).toBeTruthy();
  });

  it("falls back to the raw kind string for one Badge doesn't have a label for", async () => {
    await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob({ kind: "mystery" as unknown as EmbeddingQueueStatusResponse["failed"][number]["kind"] })],
    });
    expect(screen.getByText("mystery")).toBeTruthy();
  });

  it("shows a dash for a failed_at of 0", async () => {
    await renderSection({
      ...BASE,
      failed_count: 1,
      failed: [failedJob({ failed_at: 0 })],
    });
    expect(screen.getByText("-")).toBeTruthy();
  });

  it.each([
    [30, "30s"],
    [120, "~2m"],
    [7_200, "~2h"],
  ])("formats an ETA of %i seconds as %s", async (eta_seconds, label) => {
    await renderSection({ ...BASE, eta_seconds });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("prunes a selection whose entry disappears from the failed list on refetch", async () => {
    api.fetchEmbeddingQueueStatus
      .mockResolvedValueOnce({
        ...BASE,
        failed_count: 1,
        failed: [failedJob()],
      })
      .mockResolvedValueOnce({ ...BASE, failed_count: 0, failed: [] });

    const result = renderWithProviders(<EmbeddingQueueSection refetchInterval={false} />);
    await screen.findByText("Embeddings");
    await waitFor(() => expect(screen.queryByText("Loading embedding queue...")).toBeNull());
    const { user } = result;

    await user.click(screen.getByRole("checkbox", { name: "Select track-1" }));
    expect(screen.getByRole("button", { name: /Retry selected \(1\)/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Refresh embedding queue" }));
    await waitFor(() => expect(screen.getByText("No failed embedding jobs.")).toBeTruthy());
  });
});
