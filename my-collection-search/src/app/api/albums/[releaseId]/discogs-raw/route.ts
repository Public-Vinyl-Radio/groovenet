import { NextRequest, NextResponse } from "next/server";
import { getReleasePath, loadAlbum } from "@/server/services/discogsManifestService";
import { albumRepository } from "@/server/repositories/albumRepository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id");
    const friendId = Number(friendIdRaw);

    if (!releaseId || !friendId || Number.isNaN(friendId)) {
      return NextResponse.json(
        { error: "Missing required parameters: releaseId and friend_id" },
        { status: 400 },
      );
    }

    const username = await albumRepository.getFriendUsernameById(friendId);
    if (!username) {
      return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const releasePath = getReleasePath(username, String(releaseId));
    if (!releasePath) {
      return NextResponse.json({ error: "Discogs release file not found" }, { status: 404 });
    }

    const album = loadAlbum(releasePath);
    if (!album) {
      return NextResponse.json({ error: "Failed to parse Discogs release file" }, { status: 500 });
    }

    return NextResponse.json({
      friend_id: friendId,
      release_id: String(releaseId),
      username,
      file_path: releasePath,
      data: album,
    });
  } catch (error) {
    console.error("Failed to read Discogs raw file:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
