import { NextResponse } from "next/server";
import { setDerivationResultBodySchema } from "@/api-contract/schemas";
import {
  SetDerivationNotFound,
  setDerivationService,
} from "@/server/services/setDerivationService";

export const runtime = "nodejs";

/**
 * Where `fingerprint-set-worker` reports every window of a recording (#282).
 *
 * The raw per-window matches are stored as they arrive; grouping into plays
 * happens on read. A window with no candidates is unidentified audio, kept.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = setDerivationResultBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_result", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const derivation = await setDerivationService.report({
      ...parsed.data,
      // The path is authoritative, as for ingest results.
      derivation_id: id,
    });
    return NextResponse.json({
      derivation_id: derivation.id,
      status: derivation.status,
      windows: parsed.data.windows.length,
    });
  } catch (error) {
    if (error instanceof SetDerivationNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error recording set derivation result:", err);
    return NextResponse.json({ error: err.message || "Failed to record result" }, { status: 500 });
  }
}
