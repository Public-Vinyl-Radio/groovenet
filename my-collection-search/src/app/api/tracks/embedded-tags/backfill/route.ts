import { NextResponse } from "next/server";
import {
  embeddedTagsBackfillRequestSchema,
  embeddedTagsBackfillRunSchema,
} from "@groovenet/contracts";
import { embeddedTagsBackfillService } from "@/server/services/embeddedTagsBackfillService";

export const runtime = "nodejs";

/**
 * Start an embedded-tags backfill (#673): read composer, genre and lyrics from
 * every local file not read since it last changed. Returns the totals at once;
 * the work carries on in the background and is read back from
 * `/api/tracks/embedded-tags/backfill/{runId}`.
 */
export async function POST(req: Request) {
  try {
    const text = await req.text();
    const parsed = embeddedTagsBackfillRequestSchema.safeParse(text ? JSON.parse(text) : {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid backfill request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const run = await embeddedTagsBackfillService.start(parsed.data);
    return NextResponse.json(embeddedTagsBackfillRunSchema.parse(run), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error starting embedded tags backfill:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start embedded tags backfill" },
      { status: 500 },
    );
  }
}
