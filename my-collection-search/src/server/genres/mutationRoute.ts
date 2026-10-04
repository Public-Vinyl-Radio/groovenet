import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { genreParamsSchema } from "@/api-contract/schemas";
import { GenreAdminError } from "@/server/services/genreAdminService";

/** Shared validation and error mapping for taxonomy admin routes. */
export async function genreMutation<B, R>(
  request: NextRequest,
  bodySchema: z.ZodType<B>,
  responseSchema: z.ZodType<R>,
  action: (body: B, id: string) => Promise<R>,
  options: { params?: Promise<{ id: string }>; status?: number } = {},
) {
  try {
    let id = "";
    if (options.params) {
      const params = genreParamsSchema.safeParse(await options.params);
      if (!params.success) return NextResponse.json({ error: "Invalid genre ID", details: params.error.flatten() }, { status: 400 });
      id = params.data.id;
    }
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid genre request", details: body.error.flatten() }, { status: 400 });
    const result = await action(body.data, id);
    return NextResponse.json(responseSchema.parse(result), { status: options.status ?? 200 });
  } catch (error) {
    if (error instanceof GenreAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Genre mutation failed:", error);
    return NextResponse.json({ error: "Failed to modify genre taxonomy" }, { status: 500 });
  }
}
