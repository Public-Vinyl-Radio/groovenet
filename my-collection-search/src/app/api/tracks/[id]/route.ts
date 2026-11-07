import { NextRequest, NextResponse } from "next/server";
import { toWireRow } from "@/lib/wireRow";
import { trackDeleteResponseSchema, trackEntitySchema } from "@/api-contract/schemas";
import { trackRepository } from "@/server/repositories/trackRepository";
import { withArtistCredits } from "@/server/services/artistCreditService";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const track_id = (await params).id;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id")?.trim();

    if (!track_id || !friendIdRaw) {
      return NextResponse.json(
        { error: "Missing required parameters: track_id and friend_id" },
        { status: 400 },
      );
    }

    const friend_id = Number(friendIdRaw);
    if (!Number.isFinite(friend_id)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const track = await trackRepository.softDeleteTrack(track_id, friend_id);

    if (!track) {
      return NextResponse.json({ error: "Track not found or already deleted" }, { status: 404 });
    }

    return NextResponse.json(
      trackDeleteResponseSchema.parse({ success: true, track_id, friend_id }),
    );
  } catch (error) {
    console.error("Error soft-deleting track:", error);
    return NextResponse.json({ error: "Failed to delete track" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const track_id = (await params).id;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id")?.trim();

    if (!track_id || !friendIdRaw) {
      return NextResponse.json(
        {
          error: "Missing required parameters: track_id and friend_id ",
        },
        { status: 400 },
      );
    }

    const friend_id = Number(friendIdRaw);
    if (!Number.isFinite(friend_id)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const track = await trackRepository.findTrackByTrackIdAndFriendIdWithLibraryFallback(
      track_id,
      friend_id,
    );

    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const {
      tracks: [credited],
    } = await withArtistCredits([], [track]);
    return NextResponse.json(trackEntitySchema.parse(toWireRow(credited)));
  } catch (error) {
    console.error("Error fetching track by id & friend_id:", error);
    return NextResponse.json({ error: "Failed to fetch track" }, { status: 500 });
  }
}
