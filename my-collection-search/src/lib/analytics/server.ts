// Server entry point, for route handlers and services. Never import this from
// client code: it pulls in posthog-node.

import { readAnalyticsConfig } from "./config";
import type { AnalyticsEventName, AnalyticsEvents } from "./events";
import { noopProvider } from "./providers/noop";
import { createPosthogServerProvider } from "./providers/posthog-server";
import { safely, safelyAsync } from "./safe";
import type { AnalyticsProperties, AnalyticsProvider } from "./types";

export type ServerTrackOptions = {
  /** The incoming request, used to link the event to the browser that sent it. */
  request?: Request;
  /** An explicit identity; wins over the one derived from `request`. */
  distinctId?: string;
};

let provider: AnalyticsProvider | null = null;

function createProvider(): AnalyticsProvider {
  const config = readAnalyticsConfig();
  if (config.provider === "none") return noopProvider;
  try {
    return createPosthogServerProvider(config.key, config.host);
  } catch (error) {
    console.warn("[analytics] PostHog init failed; analytics disabled:", error);
    return noopProvider;
  }
}

function getProvider(): AnalyticsProvider {
  provider ??= createProvider();
  return provider;
}

/** Swap the backend, e.g. for a MemoryAnalyticsProvider in tests. `null` goes back to the env config. */
export function setAnalyticsProvider(next: AnalyticsProvider | null) {
  provider = next;
}

export const analytics = {
  track<E extends AnalyticsEventName>(
    event: E,
    properties: AnalyticsEvents[E],
    options: ServerTrackOptions = {}
  ): void {
    safely(`track(${event})`, () => {
      const p = getProvider();
      const distinctId =
        options.distinctId ??
        (options.request ? p.distinctIdFromRequest?.(options.request) : undefined);
      p.track(event, properties as AnalyticsProperties, distinctId);
    });
  },

  identify(distinctId: string, traits?: AnalyticsProperties): void {
    safely("identify", () => getProvider().identify(distinctId, traits));
  },

  flush(): Promise<void> {
    return safelyAsync("flush", () => getProvider().flush());
  },

  shutdown(): Promise<void> {
    return safelyAsync("shutdown", async () => {
      await provider?.shutdown();
      provider = null;
    });
  },
};
