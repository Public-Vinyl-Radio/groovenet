import { NextRequest, NextResponse } from "next/server";
import {
  albumArtworkBackfillBodySchema,
  albumArtworkBackfillResponseSchema,
} from "@/api-contract/schemas";
import { trackOpsService } from "@/server/services/trackOpsService";

/**
 * POST /api/albums/artwork/backfill — queue the bulk artwork matcher: one
 * extract-cover-art-album job per album whose art nobody has chosen yet and
 * that has downloaded audio. Optional `friend_id` limits it to one library.
 */
export async function POST(request: NextRequest) {
  const body = albumArtworkBackfillBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!body.success) {
    return NextResponse.json({ error: "friend_id must be a positive integer" }, { status: 400 });
  }
  try {
    const result = await trackOpsService.queueCoverArtBackfillJobs({
      friend_id: body.data.friend_id ?? null,
    });
    return NextResponse.json(albumArtworkBackfillResponseSchema.parse(result));
  } catch (error) {
    console.error("[Album Artwork API] Failed to queue artwork matching:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to queue artwork matching" },
      { status: 500 }
    );
  }
}
