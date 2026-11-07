import { NextResponse } from "next/server";
import {
  audioMetadataBackfillRequestSchema,
  audioMetadataBackfillRunSchema,
} from "@groovenet/contracts";
import { audioMetadataBackfillService } from "@/server/services/audioMetadataBackfillService";

export const runtime = "nodejs";

/**
 * Start an audio-metadata backfill (#1049): probe every local file once and
 * fill the `audio_*` columns, source included. Returns the totals at once; the
 * work carries on in the background and is read back from
 * `/api/tracks/audio-metadata/backfill/{runId}`.
 */
export async function POST(req: Request) {
  try {
    const text = await req.text();
    const parsed = audioMetadataBackfillRequestSchema.safeParse(text ? JSON.parse(text) : {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid backfill request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const run = await audioMetadataBackfillService.start(parsed.data);
    return NextResponse.json(audioMetadataBackfillRunSchema.parse(run), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error starting audio metadata backfill:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start audio metadata backfill" },
      { status: 500 },
    );
  }
}
