export type AnalyticsProperties = Record<string, unknown>;

/**
 * What a backend has to implement. Providers see untyped events — the typed
 * surface lives in the client/server entry points — and may throw; the entry
 * points swallow provider errors so analytics never breaks a request.
 */
export interface AnalyticsProvider {
  readonly name: string;
  /** `distinctId` is set by the server entry point; client providers ignore it. */
  track(event: string, properties: AnalyticsProperties, distinctId?: string): void;
  identify(distinctId: string, traits?: AnalyticsProperties): void;
  reset(): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  /** Server only: the person behind a request, when the backend can tell. */
  distinctIdFromRequest?(request: Request): string | undefined;
}

/** Serialisable config the server hands to the browser at render time. */
export type ClientAnalyticsConfig =
  | { provider: "none" }
  | { provider: "posthog"; key: string; uiHost: string };
