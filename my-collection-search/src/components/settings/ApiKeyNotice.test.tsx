// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({ useIntegrationStatus: vi.fn() }));
vi.mock("@/hooks/useIntegrationStatus", () => ({
  useIntegrationStatus: mocks.useIntegrationStatus,
}));

import { NOTICE_DISMISSAL_KEY } from "@/lib/integrationKeys";
import ApiKeyNotice from "./ApiKeyNotice";

const keys = (openai: boolean, youtube: boolean) => ({
  openai: { configured: openai },
  youtube: { configured: youtube },
});
const asOwner = (openai: boolean, youtube: boolean) =>
  mocks.useIntegrationStatus.mockReturnValue({
    isOwner: true,
    status: { keys: keys(openai, youtube), embedding_models: [] },
  });

const stored = () => window.localStorage.getItem(NOTICE_DISMISSAL_KEY);

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
});
afterEach(() => window.localStorage.clear());

describe("ApiKeyNotice", () => {
  it("names the missing key and links to Settings → Integrations", async () => {
    asOwner(true, false);
    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    const notice = await screen.findByTestId("api-key-notice");
    expect(notice.textContent).toContain("No YouTube API key is configured");
    expect(notice.textContent).toContain("no local fallback");
    expect(screen.getByRole("link", { name: "See how to add it" }).getAttribute("href")).toBe(
      "/settings/integrations",
    );
  });

  it("stays hidden for a key this surface does not need, and when nothing is missing", () => {
    asOwner(false, true);
    const { unmount } = renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
    unmount();
    asOwner(true, true);
    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
  });

  it("stays hidden until status loads, and for non-owners", () => {
    mocks.useIntegrationStatus.mockReturnValue({ isOwner: false, status: undefined });
    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
  });

  it("remembers a dismissal per device, across renders", async () => {
    asOwner(true, false);
    const first = renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    fireEvent.click(await screen.findByTestId("api-key-notice-dismiss"));
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
    expect(stored()).toBe("youtube");
    first.unmount();

    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    await act(async () => {});
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
  });

  it("comes back when the set of missing keys changes", async () => {
    window.localStorage.setItem(NOTICE_DISMISSAL_KEY, "youtube");
    asOwner(false, false);
    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    expect(await screen.findByTestId("api-key-notice")).toBeTruthy();
  });

  it("forgets the dismissal once every key is configured", async () => {
    window.localStorage.setItem(NOTICE_DISMISSAL_KEY, "youtube");
    asOwner(true, true);
    renderWithProviders(<ApiKeyNotice keys={["youtube"]} />);
    await act(async () => {});
    expect(stored()).toBeNull();
    expect(screen.queryByTestId("api-key-notice")).toBeNull();
  });
});
