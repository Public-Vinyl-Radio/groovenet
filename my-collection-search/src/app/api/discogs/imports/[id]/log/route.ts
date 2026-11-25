import type { DiscogsImportLogResponse } from "@groovenet/contracts";
import { NextResponse } from "next/server";
import { discogsImportService } from "@/server/services/discogsImportService";

const MAX_LIMIT = 1000;

/** An import's progress lines after `after` (a line id), oldest first (#1274). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const importId = Number(id);
  const search = new URL(request.url).searchParams;
  const after = Number(search.get("after") ?? 0);
  const limit = Number(search.get("limit") ?? 500);
  if (
    !Number.isInteger(importId) ||
    importId <= 0 ||
    !Number.isInteger(after) ||
    after < 0 ||
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const page = await discogsImportService.readLog(importId, after, Math.min(limit, MAX_LIMIT));
    return NextResponse.json(page satisfies DiscogsImportLogResponse);
  } catch (error) {
    console.error("[Discogs Import] Log read failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
