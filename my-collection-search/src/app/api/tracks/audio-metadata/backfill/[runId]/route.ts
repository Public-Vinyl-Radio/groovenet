import { NextResponse } from "next/server";
import { audioMetadataBackfillRunSchema } from "@groovenet/contracts";
import { audioMetadataBackfillService } from "@/server/services/audioMetadataBackfillService";

export const runtime = "nodejs";

/** Progress and per-source report for one audio-metadata backfill (#1049). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const run = await audioMetadataBackfillService.getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Backfill run not found or expired" }, { status: 404 });
    }
    return NextResponse.json(audioMetadataBackfillRunSchema.parse(run));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading audio metadata backfill run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read backfill run" },
      { status: 500 },
    );
  }
}
