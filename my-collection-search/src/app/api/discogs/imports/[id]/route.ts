import type { DiscogsImportResponse } from "@groovenet/contracts";
import { NextResponse } from "next/server";
import { discogsImportService } from "@/server/services/discogsImportService";

/** One import's state: phase, counters, last error (#1274). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const importId = Number(id);
  if (!Number.isInteger(importId) || importId <= 0) {
    return NextResponse.json({ error: "Invalid import id" }, { status: 400 });
  }
  try {
    const found = await discogsImportService.get(importId);
    if (!found) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    return NextResponse.json({ import: found } satisfies DiscogsImportResponse);
  } catch (error) {
    console.error("[Discogs Import] Read failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
