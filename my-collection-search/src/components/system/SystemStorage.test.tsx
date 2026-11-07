// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const api = vi.hoisted(() => ({ fetchStorageOrphans: vi.fn(), startStorageOrphanScan: vi.fn() }));
vi.mock("@/services/internalApi/system", () => api);
import SystemStorage, { formatBytes } from "./SystemStorage";

const page = (items: unknown[], total = items.length) => ({
  items,
  total,
  limit: 5,
  offset: 0,
});
const scan = {
  scanned_at: "2026-11-06T12:00:00.000Z",
  duration_ms: 2500,
  orphan_file_count: 6,
  orphan_file_bytes: 3 * 1024 * 1024,
  missing_track_count: 1,
};
const result = (patch = {}) => ({
  running: false,
  last_scan: scan,
  last_error: null,
  files: page([{ path: "stray/a.mp3", size_bytes: 2048, modified_at: "x" }], 6),
  tracks: page([
    { track_id: "t1", username: "adam", title: "Gone", artist: "Ghost", local_audio_url: "g.mp3" },
  ]),
  ...patch,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchStorageOrphans.mockResolvedValue(result());
  api.startStorageOrphanScan.mockResolvedValue({ started: true, running: true });
});

it("formats sizes", () => {
  expect(formatBytes(12)).toBe("12 B");
  expect(formatBytes(2048)).toBe("2.0 KiB");
  expect(formatBytes(3 * 1024 ** 2)).toBe("3.0 MiB");
});

it("shows the last scan, a few of each list and a Missing file tag", async () => {
  renderWithProviders(<SystemStorage />);
  expect(await screen.findByText("Files with no track: 6 · 3.0 MiB")).toBeTruthy();
  expect(screen.getByText("stray/a.mp3")).toBeTruthy();
  expect(screen.getByText("Tracks pointing at missing files: 1")).toBeTruthy();
  expect(screen.getByText("Ghost — Gone")).toBeTruthy();
  expect(screen.getByText("Missing file")).toBeTruthy();
  expect(screen.getByText(/2\.5s/)).toBeTruthy();
});

it("View all refetches a larger page and then hides itself", async () => {
  const { user } = renderWithProviders(<SystemStorage />);
  await user.click(await screen.findByRole("button", { name: "View all" }));
  await waitFor(() => expect(api.fetchStorageOrphans).toHaveBeenLastCalledWith(500));
  await waitFor(() => expect(screen.queryByRole("button", { name: "View all" })).toBeNull());
});

it("has no View all when everything is already shown", async () => {
  api.fetchStorageOrphans.mockResolvedValue(
    result({ last_scan: { ...scan, orphan_file_count: 1, missing_track_count: 1 } }),
  );
  renderWithProviders(<SystemStorage />);
  await screen.findByText("stray/a.mp3");
  expect(screen.queryByRole("button", { name: "View all" })).toBeNull();
});

it("says so before the first scan", async () => {
  api.fetchStorageOrphans.mockResolvedValue(result({ last_scan: null }));
  renderWithProviders(<SystemStorage />);
  expect(await screen.findByText("Not scanned yet")).toBeTruthy();
});

it("starts a scan and polls until the server reports it finished", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    api.fetchStorageOrphans
      .mockResolvedValueOnce(result({ last_scan: null }))
      .mockResolvedValueOnce(result({ last_scan: null, running: true }))
      .mockResolvedValue(result());
    const { user } = renderWithProviders(<SystemStorage />);
    await user.click(await screen.findByRole("button", { name: "Scan now" }));
    expect(api.startStorageOrphanScan).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Scanning…" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(await screen.findByText("Files with no track: 6 · 3.0 MiB")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan now" })).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

it("reports a failed read, a failed start and the last scan's failure", async () => {
  api.fetchStorageOrphans.mockRejectedValueOnce(new Error("read failed"));
  const { user } = renderWithProviders(<SystemStorage />);
  expect((await screen.findByRole("alert")).textContent).toBe("read failed");

  api.fetchStorageOrphans.mockResolvedValue(result({ last_error: "disk gone" }));
  api.startStorageOrphanScan.mockRejectedValueOnce("plain string");
  await user.click(screen.getByRole("button", { name: "Scan now" }));
  expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain("plain string");
  api.startStorageOrphanScan.mockResolvedValue({ started: true, running: true });
  await user.click(screen.getByRole("button", { name: "Scan now" }));
  expect(await screen.findByText("Last scan failed: disk gone")).toBeTruthy();
});
