import { NextResponse } from "next/server";
import { embeddingQueueRetryBodySchema } from "@/api-contract/schemas";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";

/**
 * Re-enqueue selected entries from `embedding_queue:failed` (#451). The ids
 * are opaque, derived from each entry's stored JSON — the service re-reads
 * the failed list itself rather than trusting a client-supplied job body.
 */
export async function POST(req: Request) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = embeddingQueueRetryBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid retry request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await embeddingQueueService.retryFailedJobs(parsed.data.ids);
    return NextResponse.json(result);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error retrying failed embedding jobs:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retry failed embedding jobs" },
      { status: 500 }
    );
  }
}
