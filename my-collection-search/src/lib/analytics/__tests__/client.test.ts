import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInit, mockCapture, mockIdentify, mockReset } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockCapture: vi.fn(),
  mockIdentify: vi.fn(),
  mockReset: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    init: mockInit,
    capture: mockCapture,
    identify: mockIdentify,
    reset: mockReset,
  },
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
    mockIdentify.mockReset();
    mockReset.mockReset();
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

  it("forwards identify and reset to PostHog", async () => {
    stubBrowser();
    const { initAnalytics, analytics } = await loadClient();
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    analytics.identify("user-1", { plan: "dj" });
    analytics.reset();
    expect(mockIdentify).toHaveBeenCalledWith("user-1", { plan: "dj" });
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it("lets tests swap in a provider, which also blocks a later init", async () => {
    stubBrowser();
    const { setAnalyticsProvider, initAnalytics, analytics } = await loadClient();
    const { MemoryAnalyticsProvider } = await import("../providers/memory");
    const memory = new MemoryAnalyticsProvider();
    setAnalyticsProvider(memory);
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    analytics.track("search_query_executed", {
      query_length: 1,
      has_filters: false,
      filter_count: 0,
    });
    analytics.identify("user-1");
    expect(mockInit).not.toHaveBeenCalled();
    expect(memory.events.map((e) => e.event)).toEqual(["search_query_executed"]);
    expect(memory.identified).toEqual([{ distinctId: "user-1", traits: undefined }]);

    analytics.reset();
    expect(memory.events).toEqual([]);
  });

  it("keeps working when PostHog fails to start", async () => {
    stubBrowser();
    mockInit.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { initAnalytics, analytics } = await loadClient();
    initAnalytics({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    analytics.track("search_query_executed", {
      query_length: 1,
      has_filters: false,
      filter_count: 0,
    });
    expect(mockCapture).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports opt-out only for DNT or GPC", async () => {
    const { browserOptedOut } = await loadClient();
    expect(browserOptedOut(undefined)).toBe(false);
    expect(browserOptedOut({ doNotTrack: "0" } as Navigator)).toBe(false);
    expect(browserOptedOut({ doNotTrack: "1" } as Navigator)).toBe(true);
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
