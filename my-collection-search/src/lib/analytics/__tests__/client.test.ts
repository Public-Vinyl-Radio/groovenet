import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockCapture } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { init: mockInit, capture: mockCapture, identify: vi.fn(), reset: vi.fn() },
}));

type ClientModule = typeof import("../client");

// client.ts keeps module state (init runs once), so each test gets a fresh copy.
async function loadClient(): Promise<ClientModule> {
  vi.resetModules();
  return import("../client");
}

function stubBrowser(nav: Partial<Navigator & { globalPrivacyControl: boolean }> = {}) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", nav);
}

describe("client analytics", () => {
  beforeEach(() => {
    mockInit.mockReset();
    mockCapture.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not initialise PostHog when analytics is off", async () => {
    stubBrowser();
    const { initAnalytics, analytics } = await loadClient();
    initAnalytics({ provider: "none" });
    analytics.track("search_query_executed", {
      query_length: 3,
      has_filters: false,
      filter_count: 0,
    });
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("initialises PostHog through the proxy, without exception capture", async () => {
    stubBrowser();
    const { initAnalytics, analytics } = await loadClient();
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    expect(mockInit).toHaveBeenCalledOnce();
    expect(mockInit).toHaveBeenCalledWith(
      "phc_x",
      expect.objectContaining({ api_host: "/ingest", capture_exceptions: false })
    );
    analytics.track("playlist_exported", {
      playlist_id: 1,
      track_count: 2,
      export_format: "pdf",
    });
    expect(mockCapture).toHaveBeenCalledWith("playlist_exported", {
      playlist_id: 1,
      track_count: 2,
      export_format: "pdf",
    });
  });

  it.each([
    ["Do Not Track", { doNotTrack: "1" }],
    ["Global Privacy Control", { globalPrivacyControl: true }],
  ])("honours %s", async (_label, nav) => {
    stubBrowser(nav);
    const { initAnalytics } = await loadClient();
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("does nothing during server rendering", async () => {
    const { initAnalytics } = await loadClient();
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    expect(mockInit).not.toHaveBeenCalled();
  });
});
