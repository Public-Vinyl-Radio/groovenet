import { NextRequest, NextResponse } from "next/server";
import {
  artistLetterCountsQuerySchema,
  artistLetterCountsResponseSchema,
} from "@/api-contract/schemas";
import { listArtistLetters } from "@/server/services/artistListService";

/** Artists per A to Z index letter (#1116), scoped like `GET /api/artists`. */
export async function GET(request: NextRequest) {
  const query = artistLetterCountsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: query.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      artistLetterCountsResponseSchema.parse(await listArtistLetters(query.data)),
    );
  } catch (error) {
    console.error("Failed to count artist letters:", error);
    return NextResponse.json({ error: "Failed to count artist letters" }, { status: 500 });
  }
}
