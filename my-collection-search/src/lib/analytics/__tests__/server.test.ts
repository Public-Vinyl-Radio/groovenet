import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
