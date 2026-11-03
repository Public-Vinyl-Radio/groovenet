// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const api = vi.hoisted(() => ({
  fetchStatusInfo: vi.fn(),
  fetchVersionInfo: vi.fn(),
  fetchUpdateInfo: vi.fn(),
}));
vi.mock("@/services/internalApi/system", () => api);
import SystemStatus from "./SystemStatus";
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchVersionInfo.mockResolvedValue({
    version: "1.2.3",
    gitSha: "abc123",
    builtAt: "2026-10-01T00:00:00Z",
    nodeEnv: "production",
  });
  api.fetchStatusInfo.mockResolvedValue({
    services: [
      { service: "app", status: "up", latencyMs: 0, detail: "Healthy" },
      { service: "redis", status: "down", latencyMs: 4, detail: "Connection refused" },
      { service: "essentia", status: "unknown", latencyMs: null },
    ],
  });
  api.fetchUpdateInfo.mockResolvedValue({ comparable: true, updateAvailable: false, error: null });
});
it("shows services, counts, timings, build and links", async () => {
  renderWithProviders(<SystemStatus />);
  expect(await screen.findByText("1 OF 3 SERVICES UP")).toBeTruthy();
  expect(screen.getByText("0 MS")).toBeTruthy();
  expect(screen.queryByText("4 MS")).toBeNull();
  expect(screen.getByText("Connection refused")).toBeTruthy();
  expect(screen.getByText("down")).toBeTruthy();
  expect(await screen.findByText("1.2.3")).toBeTruthy();
  expect(screen.getByRole("link", { name: "abc123", hidden: true }).getAttribute("href")).toContain(
    "/commit/abc123",
  );
  expect(screen.getByText("Up to date")).toBeTruthy();
});
it.each([
  [
    { updateAvailable: true, latest: "2.0", releaseUrl: "https://example.com/release" },
    "2.0 available",
  ],
  [{ updateAvailable: true, latest: "2.0", releaseUrl: null }, "2.0 available"],
  [{ comparable: false }, "n/a (dev build)"],
  [{ error: "Unavailable" }, "Unavailable"],
])("reports the update state %j", async (patch, label) => {
  api.fetchUpdateInfo.mockResolvedValue({
    comparable: true,
    updateAvailable: false,
    error: null,
    ...patch,
  });
  renderWithProviders(<SystemStatus />);
  expect(await screen.findByText(label)).toBeTruthy();
  if ("releaseUrl" in patch && patch.releaseUrl)
    expect(screen.getByRole("link", { name: label, hidden: true }).getAttribute("href")).toBe(
      patch.releaseUrl,
    );
});
it("uses fallbacks for missing build values and absent update data", async () => {
  api.fetchVersionInfo.mockResolvedValue({
    version: null,
    gitSha: null,
    builtAt: null,
    nodeEnv: null,
  });
  api.fetchStatusInfo.mockResolvedValue({
    services: [{ service: "app", status: "up", latencyMs: null }],
  });
  api.fetchUpdateInfo.mockReturnValue(new Promise(() => {}));
  renderWithProviders(<SystemStatus />);
  expect(await screen.findByText("app")).toBeTruthy();
  expect(screen.getAllByText("—").length).toBeGreaterThan(3);
});
it("reports service and version request failures", async () => {
  api.fetchVersionInfo.mockRejectedValue(new Error("Version unavailable"));
  api.fetchStatusInfo.mockRejectedValue(new Error("Health unavailable"));
  renderWithProviders(<SystemStatus />);
  expect(await screen.findByText("Version unavailable")).toBeTruthy();
  expect(await screen.findByText("Health unavailable")).toBeTruthy();
});
