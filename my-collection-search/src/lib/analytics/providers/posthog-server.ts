import { PostHog } from "posthog-node";
import type { AnalyticsProperties, AnalyticsProvider } from "../types";

export function createPosthogServerProvider(
  key: string,
  host: string
): AnalyticsProvider {
  const client = new PostHog(key, {
    host,
    // Route handlers are short-lived; send each event straight away.
    flushAt: 1,
    flushInterval: 0,
  });

  return {
    name: "posthog",
    track(event: string, properties: AnalyticsProperties, distinctId?: string) {
      client.capture({ distinctId: distinctId ?? "server", event, properties });
    },
    identify(distinctId: string, traits?: AnalyticsProperties) {
      client.identify({ distinctId, properties: traits });
    },
    reset() {},
    flush: () => client.flush(),
    shutdown: () => client.shutdown(),
    distinctIdFromRequest: (request: Request) =>
      distinctIdFromCookieHeader(request.headers.get("cookie"), key),
  };
}

/**
 * posthog-js keeps the browser's distinct id in a `ph_<key>_posthog` cookie
 * (URL-encoded JSON). Reading it lets server events join the same person as
 * the client events from that browser.
 */
export function distinctIdFromCookieHeader(
  cookieHeader: string | null | undefined,
  key: string
): string | undefined {
  if (!cookieHeader) return undefined;
  const name = `ph_${key}_posthog=`;
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" && parsed.distinct_id
      ? parsed.distinct_id
      : undefined;
  } catch {
    return undefined;
  }
}
