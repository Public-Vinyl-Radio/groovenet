import { NextRequest, NextResponse } from "next/server";
import { albumFriendQuerySchema } from "@/api-contract/schemas";
import { AlbumArtworkError } from "@/server/services/albumArtworkService";

/** Reads the required `friend_id` query param; returns a 400 response when it is invalid. */
export function parseArtworkFriendId(request: NextRequest): number | NextResponse {
  const parsed = albumFriendQuerySchema.safeParse({
    friend_id: request.nextUrl.searchParams.get("friend_id"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "friend_id query parameter is required" },
      { status: 400 }
    );
  }
  return parsed.data.friend_id;
}

export function artworkErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AlbumArtworkError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[Album Artwork API] ${fallback}:`, error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}
