import { NextRequest, NextResponse } from "next/server";
import { albumApiService } from "@/server/services/albumApiService";
import { albumRepository } from "@/server/repositories/albumRepository";
import { withDbTransaction } from "@/lib/serverDb";
import { analytics } from "@/lib/analytics/server";

/**
 * GET /api/albums/[releaseId]?friend_id=X
 * Fetch a single album with its tracks
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const friendId = searchParams.get("friend_id");

    if (!friendId) {
      return NextResponse.json({ error: "friend_id query parameter is required" }, { status: 400 });
    }
    const parsedFriendId = Number.parseInt(friendId, 10);
    if (!Number.isFinite(parsedFriendId)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const detail = await albumApiService.getAlbumDetail(releaseId, parsedFriendId);
    if (!detail) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("[Album Detail API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/albums/[releaseId]?friend_id=X
 * Hard-deletes the album and its tracks, scoped to friend_id. For a
 * Discogs-origin album, deleting it here without also removing it from the
 * Discogs collection means the next full sync re-adds it — there is no
 * soft-delete/resurrection-protection yet.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const friendId = searchParams.get("friend_id");

    if (!friendId) {
      return NextResponse.json({ error: "friend_id query parameter is required" }, { status: 400 });
    }
    const parsedFriendId = Number.parseInt(friendId, 10);
    if (!Number.isFinite(parsedFriendId)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const album = await albumRepository.getAlbumByReleaseAndFriend(releaseId, parsedFriendId);
    if (!album) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    const trackCount = await withDbTransaction(async (client) => {
      const trackIds = await albumRepository.listTrackIdsForAlbum(releaseId, parsedFriendId);
      await albumRepository.deleteTracksByIds(client, trackIds, parsedFriendId);
      await albumRepository.deleteAlbumByReleaseAndFriend(client, releaseId, parsedFriendId);
      return trackIds.length;
    });

    analytics.track(
      "album_deleted",
      { release_id: releaseId, friend_id: parsedFriendId, track_count: trackCount },
      { request },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Album Delete API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
