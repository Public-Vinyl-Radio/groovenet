import { NextResponse } from "next/server";
import { ingestResultBodySchema } from "@/api-contract/schemas";
import {
  IngestNotFound,
  ingestLifecycleService,
} from "@/server/services/ingestLifecycleService";

export const runtime = "nodejs";

/**
 * Where `fingerprint-service` reports what a chunk turned out to be (#276).
 *
 * The app owns the database; the service does the CPU work and posts here,
 * exactly as `download-worker` does. Every window produces a row — including
 * the ones that matched nothing, because a gap in matches is how #279 finds
 * the boundary between one play and the next.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ingestId: string }> }
) {
  try {
    const { ingestId } = await params;
    const parsed = ingestResultBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_result", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const ingest = await ingestLifecycleService.report({
      ...parsed.data,
      // The path is authoritative; a body naming a different ingest is a bug
      // worth ignoring rather than honouring.
      ingest_id: ingestId,
    });

    return NextResponse.json({
      ingest_id: ingest.id,
      status: ingest.status,
      detections: parsed.data.candidates.length,
    });
  } catch (error) {
    if (error instanceof IngestNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error recording ingest result:", err);
    return NextResponse.json(
      { error: err.message || "Failed to record result" },
      { status: 500 }
    );
  }
}
