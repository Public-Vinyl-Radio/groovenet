import { NextRequest, NextResponse } from "next/server";
import { artistReconcileRequestSchema, artistReconcileResponseSchema } from "@groovenet/contracts";
import { reconcileArtists } from "@/server/services/artistReconcileService";

export const dynamic = "force-dynamic";

/**
 * Links existing albums and tracks to artists (#705). Idempotent: only rows
 * with no credits are touched. `dry_run` reports the counts and review queue
 * without writing. Synchronous; a collection is a few thousand rows.
 */
export async function POST(request: NextRequest) {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }
  const parsed = artistReconcileRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reconcile request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      artistReconcileResponseSchema.parse(await reconcileArtists(parsed.data)),
    );
  } catch (error) {
    console.error("[artists] reconcile failed:", error);
    return NextResponse.json({ error: "Artist reconcile failed" }, { status: 500 });
  }
}
