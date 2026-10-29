import { NextRequest, NextResponse } from "next/server";
import { trackEssentiaResponseSchema } from "@/api-contract/schemas";
import { readEssentiaAnalysis } from "@/lib/essentia-storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trackId = (await params).id;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id");
    const friendId = Number(friendIdRaw);
    if (!trackId || !friendId || Number.isNaN(friendId)) {
      return NextResponse.json(
        { error: "Missing required parameters: track_id and friend_id" },
        { status: 400 },
      );
    }

    const result = readEssentiaAnalysis(trackId, friendId);
    if (!result) {
      return NextResponse.json(
        { error: "No Essentia analysis file found for this track" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      trackEssentiaResponseSchema.parse({
        track_id: trackId,
        friend_id: friendId,
        file_path: result.file_path,
        data: result.payload,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
