import { NextResponse } from "next/server";
import {
  trackAnalyzeAsyncBodySchema,
  trackAnalyzeAsyncResponseSchema,
} from "@/api-contract/schemas";
import { redisJobService } from "@/server/services/redisJobService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = trackAnalyzeAsyncBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "track_id and friend_id are required" }, { status: 400 });
    }
    const { apple_music_url, youtube_url, soundcloud_url } = parsed.data;

    // At least one URL must be given; JSON Schema cannot say "one of three".
    if (!apple_music_url && !youtube_url && !soundcloud_url) {
      return NextResponse.json(
        { error: "At least one music service URL is required" },
        { status: 400 },
      );
    }

    console.log(`Queueing download job for track ${parsed.data.track_id}`);

    // Add job to download queue
    const jobId = await redisJobService.createDownloadJob({
      ...parsed.data,
      apple_music_url: apple_music_url ?? undefined,
      youtube_url: youtube_url ?? undefined,
      soundcloud_url: soundcloud_url ?? undefined,
    });

    return NextResponse.json(
      trackAnalyzeAsyncResponseSchema.parse({
        success: true,
        jobId,
        message: "Audio processing job queued successfully",
      }),
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error queueing analyze job:", err);
    return NextResponse.json(
      { error: err.message || "Failed to queue processing job" },
      { status: 500 },
    );
  }
}
