// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const jobs = vi.hoisted(() => ({
  refetch: vi.fn(),
  total: 3,
  rows: [] as import("@/types/jobs").JobInfo[],
  isLoading: false,
  clear: vi.fn(),
}));
vi.mock("@/hooks/useJobsQuery", () => ({
  useJobsQuery: () => ({
    data: {
      jobs: jobs.rows,
      summary: { total: jobs.total, waiting: 0, active: 0, completed: 0, failed: 0 },
      pagination: { total_filtered: 0, has_more: false },
    },
    isLoading: jobs.isLoading,
    refetch: jobs.refetch,
    dataUpdatedAt: 0,
  }),
}));
vi.mock("@/services/internalApi/jobs", () => ({ clearAllJobs: jobs.clear }));
vi.mock("@/components/TrackResultStore", () => ({
  default: ({ footer }: { footer: React.ReactNode }) => <div>{footer}</div>,
}));
vi.mock("@/components/jobs/EmbeddingQueueSection", () => ({ default: () => null }));

import JobsPage from "./page";

const header = () => within(screen.getByTestId("page-header"));

beforeEach(() => {
  jobs.refetch.mockReset();
  jobs.clear.mockReset().mockResolvedValue(undefined);
  jobs.total = 3;
  jobs.rows = [];
  jobs.isLoading = false;
});

describe("JobsPage header", () => {
  it("titles the page and refreshes from the header action", async () => {
    const { user } = renderWithProviders(<JobsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Downloads" })).toBeTruthy();
    await user.click(header().getByRole("button", { name: "Refresh jobs", hidden: true }));
    expect(jobs.refetch).toHaveBeenCalledTimes(1);
  });

  it("disables the header refresh while loading", () => {
    jobs.isLoading = true;
    renderWithProviders(<JobsPage />);
    expect(
      (header().getByRole("button", { name: "Refresh jobs", hidden: true }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("clears all jobs from the header overflow menu", async () => {
    const { user } = renderWithProviders(<JobsPage />);
    await user.click(header().getByRole("button", { name: "More actions", hidden: true }));
    await user.click(await screen.findByText("Clear all jobs"));
    await waitFor(() => expect(jobs.clear).toHaveBeenCalledTimes(1));
  });

  it("offers no overflow menu when there is nothing to clear", () => {
    jobs.total = 0;
    renderWithProviders(<JobsPage />);
    expect(header().queryByRole("button", { name: "More actions", hidden: true })).toBeNull();
  });
});

it("opens job details, refreshes logs and dismisses the shared viewer", async () => {
  jobs.rows = [
    {
      id: "j1",
      queue: "downloads",
      name: "download",
      state: "completed",
      progress: 100,
      attemptsMade: 1,
      data: { track_id: "t1", friend_id: 1 },
    },
  ];
  const fetchLogs = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ logs: ["Download complete"] }), { status: 200 }),
    );
  try {
    const { user } = renderWithProviders(<JobsPage />);
    await user.click(await screen.findByRole("button", { name: "Job details" }));
    const dialog = await screen.findByRole("dialog", { name: "Job Details" });
    expect(within(dialog).getByText("j1")).toBeTruthy();
    await user.click(within(dialog).getByRole("tab", { name: /Logs/ }));
    expect(await within(dialog).findByText("Download complete")).toBeTruthy();
    const calls = fetchLogs.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchLogs.mock.calls.length).toBeGreaterThan(calls));
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  } finally {
    fetchLogs.mockRestore();
  }
});
