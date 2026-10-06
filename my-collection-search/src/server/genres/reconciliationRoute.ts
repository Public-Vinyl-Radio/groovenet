import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GenreReconciliationError } from "@/server/services/genreReconciliationService";

/** Reads and validates a JSON body; an absent body is `{}`. */
export async function parseBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "Invalid reconciliation request", details: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { data: parsed.data };
}

/** Maps service errors to their status; anything else is a logged 500. */
export function reconciliationError(error: unknown): NextResponse {
  if (error instanceof GenreReconciliationError) {
    return NextResponse.json(
      error.run ? { error: error.message, run: error.run } : { error: error.message },
      { status: error.status }
    );
  }
  console.error("Genre reconciliation request failed:", error);
  return NextResponse.json({ error: "Genre reconciliation failed" }, { status: 500 });
}

export const idParamsSchema = z.object({ id: z.string().uuid() });

export async function parseId(
  params: Promise<{ id: string }>
): Promise<{ id: string } | { response: NextResponse }> {
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return {
      response: NextResponse.json({ error: "Invalid ID", details: parsed.error.flatten() }, { status: 400 }),
    };
  }
  return { id: parsed.data.id };
}
