import { NextResponse } from "next/server";
import { redisJobService } from "@/server/services/redisJobService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { track_id, friend_id, local_audio_url } = body;

    if (!track_id || friend_id == null) {
      return NextResponse.json({ error: "track_id and friend_id are required" }, { status: 400 });
    }

    const jobId = await redisJobService.createDurationJob({
      track_id,
      friend_id: Number(friend_id),
      local_audio_url: local_audio_url ?? null,
    });

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error queueing fix-duration job:", err);
    return NextResponse.json(
      { error: err.message || "Failed to queue fix-duration job" },
      { status: 500 },
    );
  }
}
