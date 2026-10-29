import { NextRequest, NextResponse } from "next/server";
import { genreSimilarQuerySchema, genreSimilarResponseSchema } from "@/api-contract/schemas";
import { getGenreSimilarPage } from "@/server/services/genreSimilarityService";

/** A genre's ranked similar genres (#377), by slug or id, with the signals that explain each one. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const query = genreSimilarQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: query.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const { id } = await context.params;
    const page = await getGenreSimilarPage(id, query.data.limit);
    if (!page) return NextResponse.json({ error: `Unknown genre: ${id}` }, { status: 404 });
    return NextResponse.json(genreSimilarResponseSchema.parse(page));
  } catch (error) {
    console.error("Failed to load similar genres:", error);
    return NextResponse.json({ error: "Failed to load similar genres" }, { status: 500 });
  }
}
