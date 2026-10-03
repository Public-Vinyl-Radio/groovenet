import { NextResponse } from "next/server";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";

/**
 * Progress for one embeddings backfill run (#388).
 *
 * The counters live in Redis, not a table: transient, updated as the queue
 * worker settles each job, and worthless once the run is old. They expire
 * on their own (`RUN_TTL_SECONDS`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await embeddingQueueService.getBackfillRun(runId);

    if (!run) {
      return NextResponse.json(
        { error: "Backfill run not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(run);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading embeddings backfill run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read backfill run" },
      { status: 500 }
    );
  }
}
