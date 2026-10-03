import { NextResponse } from "next/server";

import { dbQuery } from "@/lib/serverDb";
import { getRedisConnection } from "@/lib/redis";
import { checkEmbeddingProvider } from "@/server/services/embeddingHealthService";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";

// Server-side health fan-out for the About page. The browser can't reach the
// internal docker hostnames (db, redis, essentia, ga-service), so we probe them
// here with short timeouts and report reachability only.

export const dynamic = "force-dynamic";

type ServiceStatus = "up" | "down" | "unknown";

interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  latencyMs: number | null;
  detail?: string;
  meta?: Record<string, unknown>;
}

const TIMEOUT_MS = 3000;

// Race the work against a timer that is always cleared in `finally`, so a fast
// probe never leaves a pending timer hanging around until the timeout elapses.
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function timed(
  service: string,
  probe: () => Promise<void>
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await withTimeout(probe(), TIMEOUT_MS);
    return { service, status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      service,
      status: "down",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// Essentia's health lives at the service root; ESSENTIA_API_URL points at /analyze.
function essentiaHealthUrl(): string {
  const raw = process.env.ESSENTIA_API_URL || "http://essentia:8001/analyze";
  try {
    return new URL("/health", raw).toString();
  } catch {
    return "http://essentia:8001/health";
  }
}

function gaHealthUrl(): string {
  const raw = process.env.GA_SERVICE_URL || "http://ga-service:8002";
  try {
    return new URL("/health", raw).toString();
  } catch {
    return "http://ga-service:8002/health";
  }
}

async function probeHttp(url: string): Promise<void> {
  // Own abort signal so the request is actually cancelled on timeout rather
  // than being linked to the incoming request's lifecycle.
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// Distinct from the `embeddings` probe above: that one asks "can we reach
// OpenAI right now," this one asks "is the queue itself stuck" (#385) —
// paused on an auth error, or backed up with failures, independent of
// whether this instant's probe happens to succeed.
async function embeddingQueueHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const health = await withTimeout(
      embeddingQueueService.getQueueHealth(),
      TIMEOUT_MS
    );
    return {
      service: "embedding_queue",
      status: health.paused ? "down" : "up",
      latencyMs: Date.now() - start,
      detail: health.lastError,
      meta: { queueDepth: health.queueDepth, failedCount: health.failedCount },
    };
  } catch (err) {
    return {
      service: "embedding_queue",
      status: "unknown",
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const services = await Promise.all([
    { service: "app", status: "up" as ServiceStatus, latencyMs: 0 },
    timed("database", async () => {
      await dbQuery("SELECT 1");
    }),
    timed("redis", async () => {
      const pong = await getRedisConnection().ping();
      if (pong !== "PONG") throw new Error(`unexpected reply: ${pong}`);
    }),
    timed("essentia", () => probeHttp(essentiaHealthUrl())),
    timed("ga-service", () => probeHttp(gaHealthUrl())),
    timed("embeddings", checkEmbeddingProvider),
    embeddingQueueHealth(),
  ]);

  return NextResponse.json({ services, checkedAt: new Date().toISOString() });
}
