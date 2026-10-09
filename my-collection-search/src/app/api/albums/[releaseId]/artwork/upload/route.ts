import { NextRequest, NextResponse } from "next/server";
import { albumArtworkStateSchema } from "@/api-contract/schemas";
import { albumArtworkService } from "@/server/services/albumArtworkService";
import { artworkErrorResponse, parseArtworkFriendId } from "../../../artworkRouteUtils";

/**
 * POST /api/albums/[releaseId]/artwork/upload?friend_id=X — multipart
 * `cover_art` file (JPEG, PNG or WebP, max 5MB) becomes the album's art.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const friendId = parseArtworkFriendId(request);
  if (friendId instanceof NextResponse) return friendId;
  try {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("cover_art");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "cover_art file is required" }, { status: 400 });
    }
    const { releaseId } = await params;
    const state = await albumArtworkService.upload(releaseId, friendId, file);
    return NextResponse.json(albumArtworkStateSchema.parse(state));
  } catch (error) {
    return artworkErrorResponse(error, "Failed to upload album artwork");
  }
}
