import posthog from "posthog-js";
import type { AnalyticsProperties, AnalyticsProvider } from "../types";

export function createPosthogClientProvider(
  key: string,
  uiHost: string
): AnalyticsProvider {
  posthog.init(key, {
    // Same-origin reverse proxy: src/app/ingest/[...path]/route.ts
    api_host: "/ingest",
    ui_host: uiHost,
    defaults: "2025-11-30",
    // Unhandled errors go to Sentry; don't report them twice.
    capture_exceptions: false,
    debug: process.env.NODE_ENV === "development",
  });

  return {
    name: "posthog",
    track(event: string, properties: AnalyticsProperties) {
      posthog.capture(event, properties);
    },
    identify(distinctId: string, traits?: AnalyticsProperties) {
      posthog.identify(distinctId, traits);
    },
    reset() {
      posthog.reset();
    },
    async flush() {},
    async shutdown() {},
  };
}
