// Same-origin reverse proxy for posthog-js (api_host: "/ingest"), so ad
// blockers don't drop events. A route handler rather than next.config
// rewrites: rewrites are fixed at build time, and the published images are
// built before anyone knows which PostHog host a deploy uses.

import { posthogAssetsHost, readAnalyticsConfig } from "@/lib/analytics/config";

// Hop-by-hop and origin-specific headers that must not be forwarded.
const DROP_REQUEST_HEADERS = ["host", "connection", "cookie", "content-length"];
const DROP_RESPONSE_HEADERS = [
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
];

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const config = readAnalyticsConfig();
  if (config.provider !== "posthog") {
    return new Response(null, { status: 404 });
  }

  const { path } = await params;
  const upstreamHost =
    path[0] === "static" ? posthogAssetsHost(config.host) : config.host;
  const incoming = new URL(request.url);
  const target = new URL(`${upstreamHost}/${path.map(encodeURIComponent).join("/")}`);
  target.search = incoming.search;
  // Keep the trailing slash PostHog's API expects (see skipTrailingSlashRedirect).
  if (incoming.pathname.endsWith("/")) target.pathname += "/";

  const headers = new Headers(request.headers);
  for (const name of DROP_REQUEST_HEADERS) headers.delete(name);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of DROP_RESPONSE_HEADERS) responseHeaders.delete(name);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
