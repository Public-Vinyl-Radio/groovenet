import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { RankingProfileError } from "@/server/services/rankingProfileService";

/** The request body, or null when it isn't JSON. */
export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | null> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return null;
  }
}

/** A 400 for a body or query that doesn't validate; an invalid profile lands here. */
export function invalid(message: string, error?: { flatten: () => unknown }) {
  return NextResponse.json(
    { error: message, ...(error ? { details: error.flatten() } : {}) },
    { status: 400 },
  );
}

/** Parse `value` with `schema`, or the 400 to return. */
export function parseOr400<T>(
  schema: ZodType<T>,
  value: unknown,
  message: string,
): { data: T } | { response: NextResponse } {
  const parsed = schema.safeParse(value);
  return parsed.success ? { data: parsed.data } : { response: invalid(message, parsed.error) };
}

/** A service error as its status; anything else is a logged 500. */
export function failure(error: unknown, fallback: string) {
  if (error instanceof RankingProfileError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
