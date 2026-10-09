import { NextRequest, NextResponse } from "next/server";
import {
  albumArtworkApplyBodySchema,
  albumArtworkStateSchema,
} from "@/api-contract/schemas";
import { albumArtworkService } from "@/server/services/albumArtworkService";
import { artworkErrorResponse, parseArtworkFriendId } from "../../artworkRouteUtils";

type Params = { params: Promise<{ releaseId: string }> };

/** GET /api/albums/[releaseId]/artwork?friend_id=X — the album's artwork and where it came from. */
export async function GET(request: NextRequest, { params }: Params) {
  const friendId = parseArtworkFriendId(request);
  if (friendId instanceof NextResponse) return friendId;
  try {
    const { releaseId } = await params;
    const state = await albumArtworkService.getState(releaseId, friendId);
    return NextResponse.json(albumArtworkStateSchema.parse(state));
  } catch (error) {
    return artworkErrorResponse(error, "Failed to load album artwork");
  }
}

/**
 * PUT /api/albums/[releaseId]/artwork?friend_id=X — use the Apple Music
 * (embedded) art, or restore the Discogs art. Either is cached locally.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const friendId = parseArtworkFriendId(request);
  if (friendId instanceof NextResponse) return friendId;
  const body = albumArtworkApplyBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "source must be apple_music or discogs" },
      { status: 400 }
    );
  }
  try {
    const { releaseId } = await params;
    const state = await albumArtworkService.apply(releaseId, friendId, body.data.source);
    return NextResponse.json(albumArtworkStateSchema.parse(state));
  } catch (error) {
    return artworkErrorResponse(error, "Failed to update album artwork");
  }
}
