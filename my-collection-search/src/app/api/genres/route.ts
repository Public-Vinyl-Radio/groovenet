import { genreMutation } from "@/server/genres/mutationRoute";
import { NextRequest, NextResponse } from "next/server";
import { genreTreeResponseSchema, genreCreateBodySchema, genreMutationResponseSchema } from "@/api-contract/schemas";
import { genreRepository } from "@/server/repositories/genreRepository";
import { createGenre } from "@/server/services/genreAdminService";

export async function POST(request: NextRequest) {
  return genreMutation(request, genreCreateBodySchema, genreMutationResponseSchema,
    (body) => createGenre(body.name, body.parent_id), { status: 201 });
}

export async function GET() {
  try {
    const genres = await genreRepository.listTree();
    return NextResponse.json(genreTreeResponseSchema.parse({ genres }));
  } catch (error) {
    console.error("Failed to list genre taxonomy:", error);
    return NextResponse.json({ error: "Failed to list genre taxonomy" }, { status: 500 });
  }
}
