// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({ useIntegrationStatus: vi.fn() }));
vi.mock("@/hooks/useIntegrationStatus", () => ({
  useIntegrationStatus: mocks.useIntegrationStatus,
}));

import { EMBEDDING_CUTOVER_URL, OPENAI_EMBEDDING_MODEL } from "@/lib/integrationKeys";
import IntegrationsSettingsSection from "./IntegrationsSettingsSection";

const LOCAL = "bge-small-en-v1.5";
const owner = (openai: boolean, youtube: boolean, serving = LOCAL, target = LOCAL) =>
  mocks.useIntegrationStatus.mockReturnValue({
    isOwner: true,
    status: {
      keys: { openai: { configured: openai }, youtube: { configured: youtube } },
      embedding_models: [{ target_model: target, serving_model: serving }],
    },
  });
const guidance = () => screen.getByTestId("embedding-guidance");

beforeEach(() => vi.resetAllMocks());

describe("IntegrationsSettingsSection", () => {
  it("with no optional keys: says where to set them and that local embeddings need no key", () => {
    owner(false, false);
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(screen.getAllByText("Not configured")).toHaveLength(2);
    expect(screen.getByText("OPENAI_API_KEY")).toBeTruthy();
    expect(screen.getByText("YOUTUBE_API_KEY")).toBeTruthy();
    expect(screen.getByText(/no local fallback/i)).toBeTruthy();
    expect(guidance().textContent).toContain("No OpenAI key is needed");
    expect(within(guidance()).queryByRole("link")).toBeNull();
  });

  it("with keys set: shows them configured and hides the setup hint", () => {
    owner(true, true, OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_MODEL);
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(screen.getAllByText("Configured")).toHaveLength(2);
    expect(screen.queryByText("OPENAI_API_KEY")).toBeNull();
    expect(guidance().textContent).toContain("use OpenAI embeddings");
    expect(within(guidance()).queryByRole("link")).toBeNull();
  });

  it("guides a keyed local library through target, re-embed, serving", () => {
    owner(true, false);
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(guidance().textContent).toContain("never switches vectors on its own");
    expect(within(guidance()).getByRole("link").getAttribute("href")).toBe(EMBEDDING_CUTOVER_URL);
  });

  it("tells the operator to finish a started cutover", () => {
    owner(true, false, LOCAL, OPENAI_EMBEDDING_MODEL);
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(guidance().textContent).toContain("Finish the re-embed");
  });

  it("warns about OpenAI vectors without a key", () => {
    owner(false, false, OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_MODEL);
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(guidance().textContent).toContain("no OpenAI key is configured");
  });

  it("is owner-only", () => {
    mocks.useIntegrationStatus.mockReturnValue({ isOwner: false, status: undefined });
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(screen.getByText(/Only the owner profile/)).toBeTruthy();
  });

  it("shows loading and error states", () => {
    mocks.useIntegrationStatus.mockReturnValue({ isOwner: true, status: undefined });
    const { unmount } = renderWithProviders(<IntegrationsSettingsSection />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    unmount();
    mocks.useIntegrationStatus.mockReturnValue({
      isOwner: true,
      status: undefined,
      error: new Error("boom"),
    });
    renderWithProviders(<IntegrationsSettingsSection />);
    expect(screen.getByRole("alert").textContent).toBe("boom");
  });
});
