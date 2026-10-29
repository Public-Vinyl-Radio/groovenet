// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const q = vi.hoisted(() => {
  const make = () => ({
    data: undefined as unknown,
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  });
  return { stats: make(), detections: make(), retention: make(), make, intervals: [] as unknown[] };
});
vi.mock("@/hooks/useVinylPipelineQuery", () => ({
  useIngestStatsQuery: (_p: unknown, o: { refetchInterval: unknown }) => {
    q.intervals.push(o.refetchInterval);
    return q.stats;
  },
  useRecentDetectionsQuery: () => q.detections,
  useIngestRetentionQuery: () => q.retention,
}));

import VinylPipelineView from "./VinylPipelineView";

const header = () => within(screen.getByTestId("page-header"));

beforeEach(() => {
  q.stats = q.make();
  q.detections = q.make();
  q.retention = q.make();
  q.intervals = [];
});

describe("VinylPipelineView header", () => {
  it("titles the page and refreshes everything from the header action", async () => {
    const { user } = renderWithProviders(<VinylPipelineView />);
    expect(screen.getByRole("heading", { level: 1, name: "Vinyl Pipeline" })).toBeTruthy();
    await user.click(header().getByRole("button", { name: "Refresh now", hidden: true }));
    expect(q.stats.refetch).toHaveBeenCalledTimes(1);
    expect(q.detections.refetch).toHaveBeenCalledTimes(1);
    expect(q.retention.refetch).toHaveBeenCalledTimes(1);
  });

  it("pauses and resumes live polling from the header action", async () => {
    const { user } = renderWithProviders(<VinylPipelineView />);
    expect(q.intervals.at(-1)).toBe(15000);
    await user.click(header().getByRole("button", { name: "Pause live updates", hidden: true }));
    expect(q.intervals.at(-1)).toBe(false);
    await user.click(header().getByRole("button", { name: "Resume live updates", hidden: true }));
    expect(q.intervals.at(-1)).toBe(15000);
  });
});
