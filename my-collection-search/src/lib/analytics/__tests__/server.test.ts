import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthogNode = vi.hoisted(() => ({
  ctor: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = posthogNode.capture;
    identify = posthogNode.identify;
    flush = posthogNode.flush;
    shutdown = posthogNode.shutdown;
    constructor(...args: unknown[]) {
      posthogNode.ctor(...args);
    }
  },
}));
import { analytics, setAnalyticsProvider } from "../server";
import { MemoryAnalyticsProvider } from "../providers/memory";
import { noopProvider } from "../providers/noop";
import { distinctIdFromCookieHeader } from "../providers/posthog-server";
import { resetWarnedForTests } from "../safe";

const phCookie = (key: string, value: unknown) =>
  `ph_${key}_posthog=${encodeURIComponent(JSON.stringify(value))}`;

describe("server analytics", () => {
  let memory: MemoryAnalyticsProvider;

  beforeEach(() => {
    memory = new MemoryAnalyticsProvider();
    setAnalyticsProvider(memory);
    resetWarnedForTests();
  });

  afterEach(() => {
    setAnalyticsProvider(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("records typed events", () => {
    analytics.track("friend_added", { friend_username: "dj", source: "api" });
    expect(memory.events).toEqual([
      {
        event: "friend_added",
        properties: { friend_username: "dj", source: "api" },
        distinctId: undefined,
      },
    ]);
  });

  it("rejects unknown events and wrong properties at compile time", () => {
    // @ts-expect-error unknown event name
    analytics.track("frend_added", { friend_username: "dj", source: "api" });
    // @ts-expect-error missing required property
    analytics.track("friend_added", { source: "api" });
    // @ts-expect-error wrong property type
    analytics.track("friend_added", { friend_username: 1, source: "api" });
  });

  it("derives the distinct id from the request when the provider can", () => {
    memory.distinctIdFromRequest = (req) => req.headers.get("x-test-id") ?? undefined;
    const request = new Request("http://localhost/", { headers: { "x-test-id": "abc" } });
    analytics.track("friend_added", { friend_username: "dj", source: "api" }, { request });
    expect(memory.events[0].distinctId).toBe("abc");
  });

  it("prefers an explicit distinct id", () => {
    memory.distinctIdFromRequest = () => "from-request";
    analytics.track(
      "friend_added",
      { friend_username: "dj", source: "api" },
      { request: new Request("http://localhost/"), distinctId: "explicit" }
    );
    expect(memory.events[0].distinctId).toBe("explicit");
  });

  it("swallows provider errors and warns only once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(memory, "track").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => {
      analytics.track("friend_added", { friend_username: "a", source: "api" });
      analytics.track("friend_added", { friend_username: "b", source: "api" });
    }).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("uses the noop provider when analytics is off", async () => {
    setAnalyticsProvider(null);
    vi.stubEnv("ANALYTICS_PROVIDER", "none");
    vi.stubEnv("POSTHOG_KEY", "phc_x");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");
    analytics.track("friend_added", { friend_username: "dj", source: "api" });
    await analytics.flush();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("server analytics — memory provider", () => {
  it("forwards identify", () => {
    const memory = new MemoryAnalyticsProvider();
    setAnalyticsProvider(memory);
    analytics.identify("user-1", { plan: "dj" });
    expect(memory.identified).toEqual([{ distinctId: "user-1", traits: { plan: "dj" } }]);
    setAnalyticsProvider(null);
  });

  it("swallows a failing flush", async () => {
    resetWarnedForTests();
    const memory = new MemoryAnalyticsProvider();
    vi.spyOn(memory, "flush").mockRejectedValue(new Error("offline"));
    setAnalyticsProvider(memory);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(analytics.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    setAnalyticsProvider(null);
    vi.restoreAllMocks();
  });
});

describe("server analytics — PostHog provider", () => {
  beforeEach(async () => {
    await analytics.shutdown();
    setAnalyticsProvider(null);
    resetWarnedForTests();
    for (const fn of Object.values(posthogNode)) fn.mockClear();
    vi.stubEnv("ANALYTICS_PROVIDER", "posthog");
    vi.stubEnv("POSTHOG_KEY", "phc_x");
    vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  afterEach(async () => {
    await analytics.shutdown();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is built from the env and sends each event immediately", () => {
    analytics.track("friend_added", { friend_username: "dj", source: "api" });
    expect(posthogNode.ctor).toHaveBeenCalledWith("phc_x", {
      host: "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
    expect(posthogNode.capture).toHaveBeenCalledWith({
      distinctId: "server",
      event: "friend_added",
      properties: { friend_username: "dj", source: "api" },
    });
  });

  it("links the event to the browser's PostHog cookie", () => {
    const request = new Request("http://localhost/", {
      headers: { cookie: phCookie("phc_x", { distinct_id: "browser-1" }) },
    });
    analytics.track("friend_added", { friend_username: "dj", source: "api" }, { request });
    expect(posthogNode.capture).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: "browser-1" })
    );
  });

  it("forwards identify and flush", async () => {
    analytics.identify("user-1", { plan: "dj" });
    await analytics.flush();
    expect(posthogNode.identify).toHaveBeenCalledWith({
      distinctId: "user-1",
      properties: { plan: "dj" },
    });
    expect(posthogNode.flush).toHaveBeenCalledOnce();
  });

  it("shuts the client down and builds a fresh one afterwards", async () => {
    analytics.track("friend_added", { friend_username: "a", source: "api" });
    await analytics.shutdown();
    expect(posthogNode.shutdown).toHaveBeenCalledOnce();
    analytics.track("friend_added", { friend_username: "b", source: "api" });
    expect(posthogNode.ctor).toHaveBeenCalledTimes(2);
  });

  it("falls back to noop when the SDK fails to start", () => {
    posthogNode.ctor.mockImplementationOnce(() => {
      throw new Error("bad key");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      analytics.track("friend_added", { friend_username: "dj", source: "api" })
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("PostHog init failed"),
      expect.any(Error)
    );
    expect(posthogNode.capture).not.toHaveBeenCalled();
  });
});

describe("noopProvider", () => {
  it("never throws", async () => {
    expect(() => noopProvider.track("x", {})).not.toThrow();
    await expect(noopProvider.shutdown()).resolves.toBeUndefined();
  });
});

describe("distinctIdFromCookieHeader", () => {
  it("reads the posthog-js cookie for the configured key", () => {
    const header = `other=1; ${phCookie("phc_x", { distinct_id: "user-1" })}`;
    expect(distinctIdFromCookieHeader(header, "phc_x")).toBe("user-1");
  });

  it("ignores another project's cookie", () => {
    const header = phCookie("phc_other", { distinct_id: "user-1" });
    expect(distinctIdFromCookieHeader(header, "phc_x")).toBeUndefined();
  });

  it("tolerates a missing or malformed cookie", () => {
    expect(distinctIdFromCookieHeader(null, "phc_x")).toBeUndefined();
    expect(distinctIdFromCookieHeader("ph_phc_x_posthog=%7Bnope", "phc_x")).toBeUndefined();
    expect(
      distinctIdFromCookieHeader(phCookie("phc_x", { distinct_id: 42 }), "phc_x")
    ).toBeUndefined();
  });
});
