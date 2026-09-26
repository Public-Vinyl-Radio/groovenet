import { NextResponse } from "next/server";
import {
  SetDerivationNotFound,
  setDerivationService,
} from "@/server/services/setDerivationService";

export const runtime = "nodejs";

/**
 * `fingerprint-set-worker` announcing it has picked a run up (#282).
 * Best-effort on the worker's side, exactly like an ingest claim.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const derivation = await setDerivationService.claim(id);
    return NextResponse.json({ derivation_id: derivation.id, status: derivation.status });
  } catch (error) {
    if (error instanceof SetDerivationNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error claiming set derivation:", err);
    return NextResponse.json({ error: err.message || "Failed to claim" }, { status: 500 });
  }
}
