import { NextRequest, NextResponse } from "next/server";
import { spinTopTracksQuerySchema, spinTopTracksResponseSchema } from "@/api-contract/schemas";
import { spinLoggingService } from "@/server/services/spinLoggingService";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = spinTopTracksQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      release_id: url.searchParams.get("release_id") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid spin top-tracks query", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const items = await spinLoggingService.listTopTracks(parsedQuery.data);
    const response = spinTopTracksResponseSchema.parse({
      items,
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error listing top spin tracks:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list top spin tracks",
      },
      { status: 500 },
    );
  }
}
