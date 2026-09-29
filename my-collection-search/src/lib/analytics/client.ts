"use client";

// Browser entry point. The provider is chosen at runtime from the config the
// root layout renders (see AnalyticsInit); until then events go to the noop
// provider, so calling `analytics.track` is always safe.

import type { AnalyticsEventName, AnalyticsEvents } from "./events";
import { noopProvider } from "./providers/noop";
import { createPosthogClientProvider } from "./providers/posthog-client";
import { safely } from "./safe";
import type {
  AnalyticsProperties,
  AnalyticsProvider,
  ClientAnalyticsConfig,
} from "./types";

let provider: AnalyticsProvider = noopProvider;
let initialised = false;

/** Do Not Track or Global Privacy Control means no analytics at all. */
export function browserOptedOut(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  const gpc = (nav as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl;
  return gpc === true || nav.doNotTrack === "1";
}

export function initAnalytics(config: ClientAnalyticsConfig): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  if (config.provider === "none" || browserOptedOut()) return;
  safely("init", () => {
    provider = createPosthogClientProvider(config.key, config.uiHost);
  });
}

/** Swap the backend in tests. */
export function setAnalyticsProvider(next: AnalyticsProvider) {
  provider = next;
  initialised = true;
}

export const analytics = {
  track<E extends AnalyticsEventName>(
    event: E,
    properties: AnalyticsEvents[E]
  ): void {
    safely(`track(${event})`, () =>
      provider.track(event, properties as AnalyticsProperties)
    );
  },

  identify(distinctId: string, traits?: AnalyticsProperties): void {
    safely("identify", () => provider.identify(distinctId, traits));
  },

  reset(): void {
    safely("reset", () => provider.reset());
  },
};
