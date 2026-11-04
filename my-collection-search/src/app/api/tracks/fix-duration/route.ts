import { NextResponse } from "next/server";
import { trackFixDurationBodySchema, trackFixDurationResponseSchema } from "@/api-contract/schemas";
import { redisJobService } from "@/server/services/redisJobService";

export async function POST(request: Request) {
  try {
    const parsed = trackFixDurationBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "track_id and friend_id are required" }, { status: 400 });
    }

    const jobId = await redisJobService.createDurationJob({
      ...parsed.data,
      local_audio_url: parsed.data.local_audio_url ?? null,
    });

    return NextResponse.json(trackFixDurationResponseSchema.parse({ success: true, jobId }));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error queueing fix-duration job:", err);
    return NextResponse.json(
      { error: err.message || "Failed to queue fix-duration job" },
      { status: 500 },
    );
  }
}
