import { NextRequest, NextResponse } from "next/server";
import {
  albumArtworkReviewQuerySchema,
  albumArtworkReviewResponseSchema,
} from "@/api-contract/schemas";
import { albumArtworkService } from "@/server/services/albumArtworkService";

/**
 * GET /api/albums/artwork/review — albums the bulk matcher would not decide on
 * its own (Apple Music art looks different, or no Discogs art to compare).
 */
export async function GET(request: NextRequest) {
  const query = albumArtworkReviewQuerySchema.safeParse({
    friend_id: request.nextUrl.searchParams.get("friend_id") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Invalid artwork review query" }, { status: 400 });
  }
  try {
    const albums = await albumArtworkService.listReview(
      query.data.friend_id ?? null,
      query.data.limit
    );
    return NextResponse.json(albumArtworkReviewResponseSchema.parse({ albums }));
  } catch (error) {
    console.error("[Album Artwork API] Failed to list artwork review:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list artwork review" },
      { status: 500 }
    );
  }
}
