import { NextRequest, NextResponse } from "next/server";
import {
  genreUpdateBodySchema,
  genreMutationResponseSchema,
  genrePageQuerySchema,
  genrePageResponseSchema,
} from "@/api-contract/schemas";
import { updateGenre } from "@/server/services/genreAdminService";
import { getGenrePage } from "@/server/services/genrePageService";
import { genreMutation } from "@/server/genres/mutationRoute";

/** One genre's page (#376), by slug or id; `friend_id` scopes it to that collection. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const query = genrePageQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: query.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const { id } = await context.params;
    const page = await getGenrePage(id, query.data.friend_id);
    if (!page) return NextResponse.json({ error: `Unknown genre: ${id}` }, { status: 404 });
    return NextResponse.json(genrePageResponseSchema.parse(page));
  } catch (error) {
    console.error("Failed to load genre page:", error);
    return NextResponse.json({ error: "Failed to load genre" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return genreMutation(request, genreUpdateBodySchema, genreMutationResponseSchema, async (body, id) => {
    return updateGenre(id, body);
  }, { params: context.params });
}
