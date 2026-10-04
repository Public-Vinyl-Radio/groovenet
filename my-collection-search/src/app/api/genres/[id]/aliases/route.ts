import { NextRequest } from "next/server";
import { genreAliasBodySchema, genreAliasResponseSchema } from "@/api-contract/schemas";
import { addGenreAlias } from "@/server/services/genreAdminService";
import { genreMutation } from "@/server/genres/mutationRoute";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return genreMutation(request, genreAliasBodySchema, genreAliasResponseSchema, async (body, id) => {
    await addGenreAlias(id, body.alias); return { success: true as const };
  }, { params: context.params, status: 201 });
}
