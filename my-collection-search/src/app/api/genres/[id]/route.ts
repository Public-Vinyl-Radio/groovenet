import { NextRequest } from "next/server";
import { genreUpdateBodySchema, genreMutationResponseSchema } from "@/api-contract/schemas";
import { updateGenre } from "@/server/services/genreAdminService";
import { genreMutation } from "@/server/genres/mutationRoute";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return genreMutation(request, genreUpdateBodySchema, genreMutationResponseSchema, async (body, id) => {
    return updateGenre(id, body);
  }, { params: context.params });
}
