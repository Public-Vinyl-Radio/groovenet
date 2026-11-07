import { NextRequest, NextResponse } from "next/server";
import { artistListQuerySchema, artistListResponseSchema } from "@/api-contract/schemas";
import { listArtists } from "@/server/services/artistListService";

/** Search the artist list by name or alias (#710); `friend_id` keeps one collection's artists. */
export async function GET(request: NextRequest) {
  const query = artistListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: query.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(artistListResponseSchema.parse(await listArtists(query.data)));
  } catch (error) {
    console.error("Failed to list artists:", error);
    return NextResponse.json({ error: "Failed to list artists" }, { status: 500 });
  }
}
