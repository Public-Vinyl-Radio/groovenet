import { NextRequest, NextResponse } from "next/server";
import { spinTrackStatsQuerySchema, spinTrackStatsResponseSchema } from "@/api-contract/schemas";
import { spinLoggingService } from "@/server/services/spinLoggingService";

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const query = spinTrackStatsQuerySchema.safeParse({
      friend_id: params.get("friend_id"),
      track_id: params.get("track_id"),
    });
    if (!query.success) {
      return NextResponse.json(
        { error: "Invalid spin track-stats query", details: query.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      spinTrackStatsResponseSchema.parse(await spinLoggingService.getTrackStats(query.data)),
    );
  } catch (error) {
    console.error("Error getting spin track stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get spin track stats" },
      { status: 500 },
    );
  }
}
