import { NextResponse } from "next/server";
import { fingerprintIndexRunSchema } from "@/api-contract/schemas";
import { fingerprintIndexService } from "@/server/services/fingerprintIndexService";

/**
 * Progress for one indexing run (#277).
 *
 * The counters are written by `fingerprint-service` as it finishes each track,
 * which is why they live in Redis rather than a table: transient, updated once
 * per track, and worthless an hour after the run ends. They expire on their own.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await fingerprintIndexService.getRun(runId);

    if (!run) {
      return NextResponse.json(
        { error: "Index run not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(fingerprintIndexRunSchema.parse(run));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading fingerprint index run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read indexing run" },
      { status: 500 }
    );
  }
}
