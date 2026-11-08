// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const api = vi.hoisted(() => ({ fetchStorageInfo: vi.fn() }));
vi.mock("@/services/internalApi/system", () => api);
import StorageOverview, { formatBytes } from "./StorageOverview";

const data = {
  totals: {
    tracks: 10,
    files: 7,
    size_bytes: 2_500_000_000,
    lossless_files: 2,
    lossless_size_bytes: 1_500_000_000,
    unprobed_files: 4,
  },
  by_source: [
    { source: "apple_music", files: 3, size_bytes: 2_000_000_000 },
    { source: null, files: 4, size_bytes: 0 },
  ],
  by_codec: [
    { codec: "flac", lossless: true, files: 2, size_bytes: 1_500_000_000 },
    { codec: "aac", lossless: false, files: 1, size_bytes: 1_000_000_000 },
    { codec: null, lossless: null, files: 4, size_bytes: 0 },
  ],
  disk: { total_bytes: 1e12, audio_bytes: 2.5e9, other_bytes: 1e11, free_bytes: 8e11 },
};

beforeEach(() => vi.resetAllMocks());

it("formats byte sizes", () => {
  expect(formatBytes(2e12)).toBe("2.00 TB");
  expect(formatBytes(2.5e9)).toBe("2.50 GB");
  expect(formatBytes(3e6)).toBe("3.0 MB");
  expect(formatBytes(4000)).toBe("4 KB");
});

it("shows totals, disk, breakdowns and the not-probed hint", async () => {
  api.fetchStorageInfo.mockResolvedValue(data);
  renderWithProviders(<StorageOverview />);
  expect(await screen.findByText("of 10 tracks")).toBeTruthy();
  expect(screen.getByText("2.50 GB")).toBeTruthy();
  expect(screen.getByText("Apple Music")).toBeTruthy();
  expect(screen.getByText("FLAC")).toBeTruthy();
  expect(screen.getByText("Lossless")).toBeTruthy();
  expect(screen.getByText("Lossy")).toBeTruthy();
  expect(screen.getAllByText("Not probed").length).toBe(2);
  expect(screen.getByText(/4 files have no stored metadata/)).toBeTruthy();
  expect(screen.getByText(/FREE 800.00 GB/)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 3, name: "FREE SPACE" })).toBeTruthy();
});

it("handles an unreadable volume, no files, and no hint", async () => {
  api.fetchStorageInfo.mockResolvedValue({
    ...data,
    totals: { ...data.totals, unprobed_files: 0 },
    by_source: [],
    by_codec: [],
    disk: null,
  });
  renderWithProviders(<StorageOverview />);
  expect(await screen.findByText("The audio volume could not be read.")).toBeTruthy();
  expect(screen.getAllByText("No local files yet.").length).toBe(2);
  expect(screen.queryByText(/have no stored metadata/)).toBeNull();
});

it("shows an error", async () => {
  api.fetchStorageInfo.mockRejectedValue(new Error("boom"));
  renderWithProviders(<StorageOverview />);
  expect((await screen.findByRole("alert")).textContent).toContain("boom");
});
