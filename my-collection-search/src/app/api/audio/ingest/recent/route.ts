import { NextResponse } from "next/server";
import {
  audioIngestRepository,
  type AudioIngestStatus,
} from "@/server/repositories/audioIngestRepository";

export const runtime = "nodejs";

const STATUSES: AudioIngestStatus[] = [
  "received",
  "processing",
  "processed",
  "failed",
];

/**
 * The newest ingests and what became of them (#299).
 *
 * Answers "is the listener device reaching us at all", which is the first
 * question when a record plays and nothing appears in the history.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");
    if (statusParam && !STATUSES.includes(statusParam as AudioIngestStatus)) {
      return NextResponse.json(
        { error: `status must be one of ${STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const offsetRaw = Number(url.searchParams.get("offset") ?? 0);

    const rows = await audioIngestRepository.listRecent({
      source_id: url.searchParams.get("source_id") ?? undefined,
      session_id: url.searchParams.get("session_id") ?? undefined,
      status: (statusParam as AudioIngestStatus) || undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 50,
      offset: Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0,
    });

    return NextResponse.json({
      ingests: rows.map((row) => ({
        ingest_id: row.id,
        source_id: row.source_id,
        session_id: row.session_id,
        sequence: row.sequence === null ? null : Number(row.sequence),
        status: row.status,
        error: row.error,
        duration_seconds: row.duration_seconds,
        sample_rate: row.sample_rate,
        channels: row.channels,
        codec: row.codec,
        // Whether the raw audio is still on the volume; terminal states
        // release it, so a processed ingest with a path is worth a look.
        file_path: row.file_path,
        captured_at: row.captured_at
          ? new Date(row.captured_at).toISOString()
          : null,
        received_at: new Date(row.received_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })),
      count: rows.length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error listing ingests:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list ingests" },
      { status: 500 }
    );
  }
}
