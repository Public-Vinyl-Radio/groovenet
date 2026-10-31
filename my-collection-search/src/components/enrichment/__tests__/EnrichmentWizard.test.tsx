// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useEnrichmentStore } from "@/stores/enrichmentStore";

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/services/internalApi/settings", () => ({
  fetchAiPromptSettings: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/useTrack", () => ({ useTrack: () => undefined }));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: vi.fn() } }));
vi.mock("../EnrichmentTrackStep", () => ({ default: () => null }));

import EnrichmentWizard from "../EnrichmentWizard";

beforeEach(() => {
  nav.push.mockReset();
  nav.back.mockReset();
  useEnrichmentStore.getState().setQueue([
    { trackId: "a", friendId: 1 },
    { trackId: "b", friendId: 1 },
  ]);
});

describe("EnrichmentWizard header", () => {
  it("titles setup with the queue size", () => {
    renderWithProviders(<EnrichmentWizard />);
    expect(screen.getByRole("heading", { level: 1, name: "Enrich" })).toBeTruthy();
    expect(screen.getByTestId("page-header-count").textContent).toBe("2 tracks");
  });

  it("singularises a one-track queue", () => {
    useEnrichmentStore.getState().setQueue([{ trackId: "a", friendId: 1 }]);
    renderWithProviders(<EnrichmentWizard />);
    expect(screen.getByTestId("page-header-count").textContent).toBe("1 track");
  });

  it("shows progress in the header while enriching, with Exit as its action", async () => {
    const { user } = renderWithProviders(<EnrichmentWizard />);
    await user.click(screen.getByRole("button", { name: /Start Enrichment/ }));
    expect(screen.getByTestId("page-header-count").textContent).toBe("1 of 2");
    await user.click(
      within(screen.getByTestId("page-header")).getByRole("button", { name: "Exit", hidden: true }),
    );
    expect(nav.push).toHaveBeenCalledWith("/tracks");
  });

  it("keeps the inline Exit for desktop", async () => {
    const { user } = renderWithProviders(<EnrichmentWizard />);
    await user.click(screen.getByRole("button", { name: /Start Enrichment/ }));
    const inline = screen.getByText("Exit");
    fireEvent.click(inline);
    expect(nav.push).toHaveBeenCalledWith("/tracks");
  });

  it("keeps the header once every track is handled", async () => {
    const { user } = renderWithProviders(<EnrichmentWizard />);
    await user.click(screen.getByRole("button", { name: /Start Enrichment/ }));
    useEnrichmentStore.getState().setQueue([]);
    // An emptied queue lands on the done phase via the progress effect.
    expect((await screen.findByText("Done")).getAttribute("data-testid")).toBe("page-header-count");
    expect(screen.getByRole("button", { name: "Back to tracks" })).toBeTruthy();
  });
});
