import { NextResponse } from "next/server";
import {
  IngestNotFound,
  ingestLifecycleService,
} from "@/server/services/ingestLifecycleService";

export const runtime = "nodejs";

/**
 * `fingerprint-service` announcing that it has picked a chunk up (#276).
 *
 * Without this the lifecycle has no `processing` state, and a chunk nothing
 * ever collected is indistinguishable from one a worker took and died on. The
 * reaper needs to tell those apart: one means restart the worker, the other
 * means the worker is crashing on this particular audio.
 *
 * Deliberately cheap and deliberately not fatal for the worker — losing a
 * claim costs diagnosis, not the result.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ingestId: string }> }
) {
  try {
    const { ingestId } = await params;
    const ingest = await ingestLifecycleService.claim(ingestId);
    return NextResponse.json({ ingest_id: ingest.id, status: ingest.status });
  } catch (error) {
    if (error instanceof IngestNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error claiming ingest:", err);
    return NextResponse.json(
      { error: err.message || "Failed to claim ingest" },
      { status: 500 }
    );
  }
}
