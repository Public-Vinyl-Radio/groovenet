import { NextResponse } from "next/server";
import { isrcBackfillRequestSchema, isrcBackfillRunSchema } from "@groovenet/contracts";
import { isrcService } from "@/server/services/isrcService";

export const runtime = "nodejs";

/**
 * Start an ISRC backfill (#1156): resolve the ISRC of every track with an
 * Apple Music link that has none yet. Returns the totals at once; the work
 * carries on in the background and is read back from
 * `/api/tracks/isrc/backfill/{runId}`.
 */
export async function POST(req: Request) {
  try {
    const text = await req.text();
    const parsed = isrcBackfillRequestSchema.safeParse(text ? JSON.parse(text) : {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid backfill request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const run = await isrcService.start(parsed.data);
    return NextResponse.json(isrcBackfillRunSchema.parse(run), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error starting ISRC backfill:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start ISRC backfill" },
      { status: 500 },
    );
  }
}
