import { NextResponse } from "next/server";
import { embeddedTagsBackfillRunSchema } from "@groovenet/contracts";
import { embeddedTagsBackfillService } from "@/server/services/embeddedTagsBackfillService";

export const runtime = "nodejs";

/** Progress for one embedded-tags backfill (#673). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const run = await embeddedTagsBackfillService.getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Backfill run not found or expired" }, { status: 404 });
    }
    return NextResponse.json(embeddedTagsBackfillRunSchema.parse(run));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading embedded tags backfill run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read backfill run" },
      { status: 500 },
    );
  }
}
