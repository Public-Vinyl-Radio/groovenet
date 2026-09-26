import { NextResponse } from "next/server";
import { setDerivationCreateBodySchema } from "@/api-contract/schemas";
import { NoFingerprintEngineError } from "@/server/services/fingerprintIndexService";
import {
  SetDerivationNotFound,
  SetDerivationQueueError,
  setDerivationService,
} from "@/server/services/setDerivationService";

export const runtime = "nodejs";

/**
 * Start deriving a tracklist from an uploaded recording (#282).
 *
 * `202` for a new run, `200` when an equivalent run — same recording, engine
 * and window settings — already exists and is handed back instead. Poll
 * `GET /api/set-derivations/{id}` for the result.
 */
export async function POST(req: Request) {
  try {
    const parsed = setDerivationCreateBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { derivation, reused } = await setDerivationService.create(parsed.data);
    // Never echo the windows: a reused run can carry hundreds of them.
    return NextResponse.json(
      { ...derivation, windows: undefined, reused },
      { status: reused ? 200 : 202 }
    );
  } catch (error) {
    if (error instanceof SetDerivationNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof NoFingerprintEngineError || error instanceof SetDerivationQueueError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error creating set derivation:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create derivation" },
      { status: 500 }
    );
  }
}
