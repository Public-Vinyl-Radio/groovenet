// Response security headers for every route (#1074), wired in by next.config.mjs.
//
// Plain ESM in config/ rather than TypeScript because next.config.mjs loads it,
// and the Docker build copies config/ before `next build`.

/**
 * The full Content-Security-Policy, sent as `Content-Security-Policy-Report-Only`.
 *
 * Why report-only: the app has no nonces, so script-src needs 'unsafe-inline' for
 * Next's inline bootstrap, and a policy that misses one source (an Apple or Discogs
 * image host, Storybook's runtime, a PostHog script) breaks a page for a user.
 * Known reports, none of them a broken page: zod v4 probes `Function("")` in a
 * try/catch to decide whether it may JIT its parsers and falls back when it cannot
 * (`z.config({ jitless: true })` would silence it); the dev server needs eval.
 * Violations show in the browser console. style-src
 * keeps 'unsafe-inline' because Chakra's emotion injects styles at runtime. Promote
 * the policy by moving the string to `Content-Security-Policy` once real use
 * reports nothing.
 *
 * Image and media hosts are open to https: because cover art comes from Discogs,
 * Apple Music and YouTube thumbnails and the list changes with the collection.
 * Everything that can run code stays on this origin: analytics goes through the
 * same-origin /ingest proxy and Sentry through /monitoring.
 */
export function contentSecurityPolicy({ dev = false, docs = false, storybook = false } = {}) {
  // Swagger UI at /api/docs loads its bundle and stylesheet from unpkg; only that route gets it.
  const unpkg = docs ? " https://unpkg.com" : "";
  return [
    "default-src 'self'",
    // Next's inline bootstrap needs 'unsafe-inline'; dev (React refresh) needs eval.
    `script-src 'self' 'unsafe-inline'${dev || storybook ? " 'unsafe-eval'" : ""}${unpkg}`,
    `style-src 'self' 'unsafe-inline'${unpkg}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}${storybook ? " https://storybook.chakra-ui.com" : ""}`,
    "media-src 'self' blob: https:",
    // Storybook (/storybook) is framed by its own page; nothing else is framed.
    "frame-src 'self'",
    // Sentry Replay runs in a worker built from a blob.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/**
 * The part of the policy that cannot break a page that works today, enforced
 * from the start: nobody else may frame the app (clickjacking), plugins are off,
 * and `<base>` and form posts cannot be pointed elsewhere.
 */
export const ENFORCED_CSP =
  "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";

/** HSTS lasts six months. No includeSubDomains or preload: the host name is the operator's. */
export const HSTS = "max-age=15552000";

/**
 * Next.js `headers()` rules. HSTS is only sent when the request reached the app
 * over HTTPS (the reverse proxy, or `tailscale serve`, sets X-Forwarded-Proto);
 * browsers ignore it over HTTP, but a plain-HTTP install should not advertise it.
 */
export function securityHeaderRules({ dev = false } = {}) {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Content-Security-Policy", value: ENFORCED_CSP },
        { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy({ dev }) },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=()",
        },
      ],
    },
    {
      source: "/api/docs",
      headers: [
        {
          key: "Content-Security-Policy-Report-Only",
          value: contentSecurityPolicy({ dev, docs: true }),
        },
      ],
    },
    {
      // The static Storybook bundle evals at runtime and composes Chakra's Storybook.
      source: "/storybook/:path*",
      headers: [
        {
          key: "Content-Security-Policy-Report-Only",
          value: contentSecurityPolicy({ dev, storybook: true }),
        },
      ],
    },
    {
      source: "/:path*",
      has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
      headers: [{ key: "Strict-Transport-Security", value: HSTS }],
    },
  ];
}
