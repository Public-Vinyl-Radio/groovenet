import { NextResponse } from "next/server";
import {
  generateTrackMetadata,
  TrackMetadataError,
} from "@/server/services/trackMetadataAiService";

export async function POST(req: Request) {
  try {
    const { prompt, friend_id, track_id } = await req.json();
    const result = await generateTrackMetadata({
      prompt,
      friendId: typeof friend_id === "number" ? friend_id : undefined,
      trackId: typeof track_id === "string" && track_id ? track_id : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TrackMetadataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error fetching AI metadata:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI metadata" },
      { status: 500 }
    );
  }
}
