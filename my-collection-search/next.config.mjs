import { withSentryConfig } from "@sentry/nextjs/config";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  process.env.WORKTREE_HOST,
].filter(Boolean);

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins,
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  turbopack: {
    root: __dirname,
  },
  // PostHog reverse proxy rewrites
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default withSentryConfig(nextConfig, {
  org: "saegey",
  project: "groovenet-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
