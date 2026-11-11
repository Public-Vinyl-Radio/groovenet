import { NextResponse } from "next/server";
import { isrcBackfillRunSchema } from "@groovenet/contracts";
import { isrcService } from "@/server/services/isrcService";

export const runtime = "nodejs";

/** Progress for one ISRC backfill (#1156). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const run = await isrcService.getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Backfill run not found or expired" }, { status: 404 });
    }
    return NextResponse.json(isrcBackfillRunSchema.parse(run));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading ISRC backfill run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read backfill run" },
      { status: 500 },
    );
  }
}
