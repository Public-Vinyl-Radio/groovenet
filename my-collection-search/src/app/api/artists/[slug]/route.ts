import { NextRequest, NextResponse } from "next/server";
import { artistPageQuerySchema, artistPageResponseSchema } from "@/api-contract/schemas";
import { getArtistPage } from "@/server/services/artistPageService";
import { withRequestRatings } from "@/server/services/trackRatingService";

/** One artist's page (#707), by slug; `friend_id` scopes it to that collection. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const query = artistPageQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: query.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const { slug } = await context.params;
    const page = await getArtistPage(slug, query.data.friend_id);
    if (!page) return NextResponse.json({ error: `Unknown artist: ${slug}` }, { status: 404 });
    const top_tracks = await withRequestRatings(request, page.top_tracks);
    return NextResponse.json(artistPageResponseSchema.parse({ ...page, top_tracks }));
  } catch (error) {
    console.error("Failed to load artist page:", error);
    return NextResponse.json({ error: "Failed to load artist" }, { status: 500 });
  }
}
