import { NextRequest, NextResponse } from "next/server";
import { albumAppleMusicArtPreviewSchema } from "@/api-contract/schemas";
import { albumArtworkService } from "@/server/services/albumArtworkService";
import { artworkErrorResponse, parseArtworkFriendId } from "../../../artworkRouteUtils";

/**
 * POST /api/albums/[releaseId]/artwork/preview?friend_id=X — extract the Apple
 * Music art embedded in the album's downloaded audio for a full-size preview.
 * Caches the image but does not change what the album displays.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const friendId = parseArtworkFriendId(request);
  if (friendId instanceof NextResponse) return friendId;
  try {
    const { releaseId } = await params;
    const preview = await albumArtworkService.previewAppleMusicArt(releaseId, friendId);
    return NextResponse.json(albumAppleMusicArtPreviewSchema.parse(preview));
  } catch (error) {
    return artworkErrorResponse(error, "Failed to extract Apple Music artwork");
  }
}
