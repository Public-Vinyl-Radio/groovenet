import type { ClientAnalyticsConfig } from "./types";

// Read at runtime, never inlined at build time: the published images are built
// once in CI and configured per deploy, so the browser gets its config from the
// server (see `getClientAnalyticsConfig`) rather than from NEXT_PUBLIC_ vars.

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export type AnalyticsConfig =
  | { provider: "none" }
  | { provider: "posthog"; key: string; host: string };

type Env = Record<string, string | undefined>;

export function readAnalyticsConfig(env: Env = process.env): AnalyticsConfig {
  const provider = (env.ANALYTICS_PROVIDER ?? "none").trim().toLowerCase();
  if (provider !== "posthog") return { provider: "none" };

  // NEXT_PUBLIC_POSTHOG_* are the pre-#338 names; accepted for one release.
  const key = (env.POSTHOG_KEY || env.NEXT_PUBLIC_POSTHOG_KEY)?.trim();
  if (!key) return { provider: "none" };

  const host = (
    env.POSTHOG_HOST ||
    env.NEXT_PUBLIC_POSTHOG_HOST ||
    DEFAULT_POSTHOG_HOST
  ).replace(/\/+$/, "");
  return { provider: "posthog", key, host };
}

// PostHog Cloud serves ingestion from <region>.i.posthog.com, static assets
// from <region>-assets.i.posthog.com and the UI from <region>.posthog.com.
// A self-hosted instance serves all three from the one host.
const CLOUD_INGEST = /^([a-z0-9-]+)\.i\.posthog\.com$/;

export function posthogAssetsHost(host: string): string {
  const url = new URL(host);
  const region = url.hostname.match(CLOUD_INGEST)?.[1];
  if (!region) return host;
  url.hostname = `${region}-assets.i.posthog.com`;
  return url.origin;
}

export function posthogUiHost(host: string): string {
  const url = new URL(host);
  const region = url.hostname.match(CLOUD_INGEST)?.[1];
  if (!region) return host;
  url.hostname = `${region}.posthog.com`;
  return url.origin;
}

export function getClientAnalyticsConfig(
  config: AnalyticsConfig = readAnalyticsConfig()
): ClientAnalyticsConfig {
  if (config.provider === "none") return { provider: "none" };
  return {
    provider: "posthog",
    key: config.key,
    uiHost: posthogUiHost(config.host),
  };
}
