import { NextResponse } from "next/server";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";

/**
 * The embedding queue's own picture of itself (#451) — lane depths, retry
 * and pause state, the failed list and active backfill runs, all read
 * through `embeddingQueueService` rather than Redis directly. Before this,
 * answering "why doesn't this track have embeddings yet?" meant `redis-cli`
 * against five different keys.
 */
export async function GET() {
  try {
    const status = await embeddingQueueService.getQueueStatus();
    return NextResponse.json(status);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading embedding queue status:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read embedding queue status" },
      { status: 500 }
    );
  }
}
