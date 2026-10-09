// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchVersionInfo: vi.fn(),
  fetchStatusInfo: vi.fn(),
  fetchUpdateInfo: vi.fn(),
}));

vi.mock("@/services/internalApi/system", () => ({
  fetchVersionInfo: mocks.fetchVersionInfo,
  fetchStatusInfo: mocks.fetchStatusInfo,
  fetchUpdateInfo: mocks.fetchUpdateInfo,
}));

import AboutSection from "./AboutSection";

const version = { version: "1.2.3", gitSha: "abc1234", builtAt: "2026-10-01T00:00:00.000Z", nodeEnv: "production" };
const status = {
  services: [{ service: "essentia", status: "up" as const, latencyMs: 12, detail: undefined }],
  checkedAt: "2026-10-08T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchVersionInfo.mockResolvedValue(version);
  mocks.fetchStatusInfo.mockResolvedValue(status);
});

describe("AboutSection", () => {
  it("shows build info, service health and links once loaded, with no update banner when up to date", async () => {
    mocks.fetchUpdateInfo.mockResolvedValue({
      current: "1.2.3", comparable: true, latest: "1.2.3", updateAvailable: false,
      releaseUrl: null, releaseName: null, publishedAt: null, error: null,
    });
    renderWithProviders(<AboutSection />);

    expect(await screen.findByText("1.2.3")).toBeTruthy();
    expect(screen.getByText("abc1234")).toBeTruthy();
    expect(screen.getByText("up to date")).toBeTruthy();
    expect(screen.getByText("essentia")).toBeTruthy();
    expect(screen.queryByText("Update available")).toBeNull();
    expect(screen.getByRole("link", { name: /GitHub/ })).toBeTruthy();
  });

  it("shows the update banner with a release-notes link when one is available", async () => {
    mocks.fetchUpdateInfo.mockResolvedValue({
      current: "1.2.3", comparable: true, latest: "1.3.0", updateAvailable: true,
      releaseUrl: "https://github.com/Public-Vinyl-Radio/groovenet/releases/tag/v1.3.0",
      releaseName: "v1.3.0", publishedAt: "2026-10-05T00:00:00.000Z", error: null,
    });
    renderWithProviders(<AboutSection />);

    expect(await screen.findByText("Update available")).toBeTruthy();
    expect(screen.getByText("1.2.3 → 1.3.0")).toBeTruthy();
    expect(screen.getByText("1.3.0 available")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View release notes/ }).getAttribute("href")).toBe(
      "https://github.com/Public-Vinyl-Radio/groovenet/releases/tag/v1.3.0"
    );
  });
});
