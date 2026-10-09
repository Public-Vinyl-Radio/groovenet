import { NextRequest, NextResponse } from "next/server";
import { albumArtMatchResultSchema } from "@/api-contract/schemas";
import { albumArtworkService } from "@/server/services/albumArtworkService";
import { artworkErrorResponse, parseArtworkFriendId } from "../../../artworkRouteUtils";

/**
 * POST /api/albums/[releaseId]/artwork/match?friend_id=X — one album's step of
 * the bulk artwork matcher, called by download-worker's extract-cover-art-album
 * job. Applies the Apple Music art only when it perceptually matches the
 * Discogs art; otherwise flags the album for review.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const friendId = parseArtworkFriendId(request);
  if (friendId instanceof NextResponse) return friendId;
  try {
    const { releaseId } = await params;
    const result = await albumArtworkService.match(releaseId, friendId);
    return NextResponse.json(albumArtMatchResultSchema.parse(result));
  } catch (error) {
    return artworkErrorResponse(error, "Failed to match album artwork");
  }
}
