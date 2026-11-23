// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const state = vi.hoisted(() => ({
  services: undefined as { service: string; status: string; latencyMs: number }[] | undefined,
}));
vi.mock("@/hooks/useSystemInfo", () => ({
  useStatusInfo: () => ({ data: state.services ? { services: state.services } : undefined }),
}));

import FirstImportChecklist from "./FirstImportChecklist";

beforeEach(() => {
  localStorage.clear();
  state.services = undefined;
});

describe("FirstImportChecklist", () => {
  it("shows nothing for a library that was never imported from an empty state", () => {
    renderWithProviders(<FirstImportChecklist />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows only the steps that apply, each with what it needs", async () => {
    localStorage.setItem("gn:first-import", "pending");
    state.services = [
      { service: "essentia", status: "up", latencyMs: 1 },
      { service: "ga-service", status: "down", latencyMs: 1 },
      { service: "embeddings", status: "up", latencyMs: 1 },
    ];
    renderWithProviders(<FirstImportChecklist />);
    const region = await screen.findByRole("region", { name: "Your library is in. What next?" });
    expect(region.textContent).toContain("Analyse your audio");
    expect(region.textContent).not.toContain("Needs the downloads profile");
    expect(region.textContent).toContain("Needs Apple Music keys (APPLE_MUSIC_TEAM_ID");
    expect(region.textContent).toContain("Needs YOUTUBE_API_KEY");
    expect(region.textContent).toContain("Needs the optimize profile");
    expect(region.textContent).not.toContain("OPENAI_API_KEY");
    expect(screen.getByRole("link", { name: "Connect Apple Music" }).getAttribute("href")).toBe(
      "/settings/apple-music",
    );
  });

  it("is dismissible, and stays dismissed on this device", async () => {
    localStorage.setItem("gn:first-import", "pending");
    const { user, unmount } = renderWithProviders(<FirstImportChecklist />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(localStorage.getItem("gn:first-import")).toBe("dismissed");
    unmount();
    renderWithProviders(<FirstImportChecklist />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
