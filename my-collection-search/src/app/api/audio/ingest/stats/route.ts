import { NextResponse } from "next/server";
import { ingestDebugService } from "@/server/services/ingestDebugService";

export const runtime = "nodejs";

/**
 * Is the vinyl pipeline working? (#299)
 *
 * Leads with the reference index, because an empty one makes every other
 * number look healthy while nothing can possibly match.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const minutesRaw = Number(url.searchParams.get("minutes") ?? 60);
    const minutes = Number.isFinite(minutesRaw)
      ? Math.min(Math.max(minutesRaw, 1), 60 * 24 * 7)
      : 60;

    return NextResponse.json(
      await ingestDebugService.stats(
        minutes,
        url.searchParams.get("source_id") ?? undefined
      )
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error building ingest stats:", err);
    return NextResponse.json(
      { error: err.message || "Failed to build stats" },
      { status: 500 }
    );
  }
}
