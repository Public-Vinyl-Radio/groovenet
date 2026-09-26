import { NextResponse } from "next/server";
import { setDerivationViewQuerySchema } from "@/api-contract/schemas";
import {
  SetDerivationNotFound,
  setDerivationService,
} from "@/server/services/setDerivationService";

export const runtime = "nodejs";

/**
 * A derivation as a tracklist, its unidentified stretches and — with
 * `playlist_id` or `live_set_id` — a diff against the plan (#282).
 *
 * Computed on read from the stored windows, so the same run answers for any
 * playlist, and a playlist corrected since reads back with a smaller diff.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const query = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = setDerivationViewQuerySchema.safeParse(query);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_query", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    return NextResponse.json(await setDerivationService.view(id, parsed.data));
  } catch (error) {
    if (error instanceof SetDerivationNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading set derivation:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read derivation" },
      { status: 500 }
    );
  }
}
