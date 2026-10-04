import { NextRequest } from "next/server";
import { genreMergeBodySchema, genreMergeResponseSchema } from "@/api-contract/schemas";
import { mergeGenres } from "@/server/services/genreAdminService";
import { genreMutation } from "@/server/genres/mutationRoute";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return genreMutation(request, genreMergeBodySchema, genreMergeResponseSchema, async (body, id) => {
    await mergeGenres(id, body.target_id); return { success: true as const, merged_genre_id: id, survivor_genre_id: body.target_id };
  }, { params: context.params });
}
