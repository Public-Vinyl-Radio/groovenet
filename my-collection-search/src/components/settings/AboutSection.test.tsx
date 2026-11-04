// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchVersionInfo: vi.fn(),
  fetchStatusInfo: vi.fn(),
  fetchUpdateInfo: vi.fn(),
  colorMode: "light",
}));

vi.mock("@/services/internalApi/system", () => ({
  fetchVersionInfo: mocks.fetchVersionInfo,
  fetchStatusInfo: mocks.fetchStatusInfo,
  fetchUpdateInfo: mocks.fetchUpdateInfo,
}));
vi.mock("@/components/ui/color-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/color-mode")>()),
  useColorMode: () => ({ colorMode: mocks.colorMode }),
}));

import AboutSection from "./AboutSection";

const version = {
  version: "1.2.3",
  gitSha: "abc1234",
  builtAt: "2026-10-01T00:00:00.000Z",
  nodeEnv: "production",
};
const upToDate = {
  current: "1.2.3",
  comparable: true,
  latest: "1.2.3",
  updateAvailable: false,
  releaseUrl: null,
  releaseName: null,
  publishedAt: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.colorMode = "light";
  mocks.fetchVersionInfo.mockResolvedValue(version);
  mocks.fetchUpdateInfo.mockResolvedValue(upToDate);
});

describe("AboutSection", () => {
  it("shows the wordmark, tagline, version and up-to-date chip", async () => {
    renderWithProviders(<AboutSection />);
    const logo = screen.getByAltText("GrooveNet");
    expect(logo.getAttribute("src")).toBe("/groovenet-wordmark-black.png");
    expect(screen.getByText("Vinyl collection management for DJs.")).toBeTruthy();
    expect(await screen.findByText("Version 1.2.3")).toBeTruthy();
    expect(await screen.findByText("Up to date")).toBeTruthy();
  });

  it("uses the white wordmark on a dark palette", () => {
    mocks.colorMode = "dark";
    renderWithProviders(<AboutSection />);
    expect(screen.getByAltText("GrooveNet").getAttribute("src")).toBe(
      "/groovenet-wordmark-white.png",
    );
  });

  it("links to the site, docs, source and the System page", () => {
    renderWithProviders(<AboutSection />);
    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/^Website/)).toBe("https://groovenet.publicvinylradio.com");
    expect(href(/^Documentation/)).toBe("https://groovenet.publicvinylradio.com/docs/");
    expect(href(/^Source code/)).toBe("https://github.com/Public-Vinyl-Radio/groovenet");
    expect(href(/System/)).toBe("/system");
  });

  it("drops Built with, Build and Services", () => {
    renderWithProviders(<AboutSection />);
    expect(screen.queryByText("Built with")).toBeNull();
    expect(screen.queryByText("Build")).toBeNull();
    expect(screen.queryByText("Services")).toBeNull();
  });

  it("shows an available update with a release-notes link", async () => {
    mocks.fetchUpdateInfo.mockResolvedValue({
      ...upToDate,
      latest: "1.3.0",
      updateAvailable: true,
      releaseUrl: "https://github.com/Public-Vinyl-Radio/groovenet/releases/tag/v1.3.0",
    });
    renderWithProviders(<AboutSection />);
    expect(await screen.findByText(/Update available · 1\.2\.3 → 1\.3\.0/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /View release notes/ }).getAttribute("href")).toBe(
      "https://github.com/Public-Vinyl-Radio/groovenet/releases/tag/v1.3.0",
    );
  });

  it("shows an available update without release notes", async () => {
    mocks.fetchUpdateInfo.mockResolvedValue({
      ...upToDate,
      updateAvailable: true,
      latest: "2",
      current: "1",
    });
    renderWithProviders(<AboutSection />);
    expect(await screen.findByText(/Update available · 1 → 2/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View release notes/ })).toBeNull();
  });

  it("shows no update chip when the check failed", async () => {
    mocks.fetchUpdateInfo.mockResolvedValue({ ...upToDate, error: "offline" });
    renderWithProviders(<AboutSection />);
    await screen.findByText("Version 1.2.3");
    expect(screen.queryByText("Up to date")).toBeNull();
  });
});
