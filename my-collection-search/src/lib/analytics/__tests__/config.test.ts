import { describe, expect, it } from "vitest";
import {
  getClientAnalyticsConfig,
  posthogAssetsHost,
  posthogUiHost,
  readAnalyticsConfig,
} from "../config";

describe("readAnalyticsConfig", () => {
  it("is off by default, even with a key set", () => {
    expect(readAnalyticsConfig({})).toEqual({ provider: "none" });
    expect(readAnalyticsConfig({ POSTHOG_KEY: "phc_x" })).toEqual({ provider: "none" });
  });

  it("is off when posthog is chosen without a key", () => {
    expect(readAnalyticsConfig({ ANALYTICS_PROVIDER: "posthog" })).toEqual({
      provider: "none",
    });
  });

  it("treats an unknown provider as off", () => {
    expect(
      readAnalyticsConfig({ ANALYTICS_PROVIDER: "mixpanel", POSTHOG_KEY: "phc_x" })
    ).toEqual({ provider: "none" });
  });

  it("reads POSTHOG_KEY and POSTHOG_HOST, trimming a trailing slash", () => {
    expect(
      readAnalyticsConfig({
        ANALYTICS_PROVIDER: " PostHog ",
        POSTHOG_KEY: "phc_x",
        POSTHOG_HOST: "https://eu.i.posthog.com/",
      })
    ).toEqual({ provider: "posthog", key: "phc_x", host: "https://eu.i.posthog.com" });
  });

  it("defaults the host to PostHog US cloud", () => {
    expect(
      readAnalyticsConfig({ ANALYTICS_PROVIDER: "posthog", POSTHOG_KEY: "phc_x" })
    ).toMatchObject({ host: "https://us.i.posthog.com" });
  });

  it("falls back to the legacy NEXT_PUBLIC_ names", () => {
    expect(
      readAnalyticsConfig({
        ANALYTICS_PROVIDER: "posthog",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_old",
        NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
      })
    ).toEqual({ provider: "posthog", key: "phc_old", host: "https://eu.i.posthog.com" });
  });
});

describe("PostHog hosts", () => {
  it("derives cloud asset and UI hosts from the ingest host", () => {
    expect(posthogAssetsHost("https://us.i.posthog.com")).toBe(
      "https://us-assets.i.posthog.com"
    );
    expect(posthogAssetsHost("https://eu.i.posthog.com")).toBe(
      "https://eu-assets.i.posthog.com"
    );
    expect(posthogUiHost("https://eu.i.posthog.com")).toBe("https://eu.posthog.com");
  });

  it("uses a self-hosted host for everything", () => {
    expect(posthogAssetsHost("https://ph.example.com")).toBe("https://ph.example.com");
    expect(posthogUiHost("https://ph.example.com")).toBe("https://ph.example.com");
  });
});

describe("getClientAnalyticsConfig", () => {
  it("exposes the key and UI host, never the ingest host", () => {
    expect(
      getClientAnalyticsConfig({
        provider: "posthog",
        key: "phc_x",
        host: "https://us.i.posthog.com",
      })
    ).toEqual({ provider: "posthog", key: "phc_x", uiHost: "https://us.posthog.com" });
    expect(getClientAnalyticsConfig({ provider: "none" })).toEqual({ provider: "none" });
  });
});
