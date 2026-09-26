import { NextResponse } from "next/server";
import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";

export const runtime = "nodejs";

/**
 * The newest matcher windows, with the track resolved (#299).
 *
 * The thing you watch while a record is playing. **No-match windows are
 * included by default** — a null `track_id` is a recorded window that matched
 * nothing, which is data rather than an absence, and filtering them out would
 * hide the most common healthy state.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 50);
    const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
    const matchedParam = url.searchParams.get("matched");

    const rows = await playDetectionRepository.listRecent({
      source_id: url.searchParams.get("source_id") ?? undefined,
      session_id: url.searchParams.get("session_id") ?? undefined,
      matched:
        matchedParam === "true" ? true : matchedParam === "false" ? false : undefined,
      since: url.searchParams.get("since") ?? undefined,
      limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 50,
      offset: Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0,
    });

    return NextResponse.json({
      detections: rows.map((row) => ({
        id: row.id,
        ingest_id: row.ingest_id,
        source_id: row.source_id,
        session_id: row.session_id,
        window_start_at: row.window_start_at
          ? new Date(row.window_start_at).toISOString()
          : null,
        matched: row.track_id !== null,
        track_id: row.track_id,
        friend_id: row.friend_id,
        title: row.track_title,
        artist: row.track_artist,
        album: row.track_album,
        confidence: row.confidence,
        offset_seconds: row.offset_seconds,
        level_dbfs: row.level_dbfs ?? null,
        fingerprint_type: row.fingerprint_type,
        fingerprint_version: row.fingerprint_version,
        created_at: new Date(row.created_at).toISOString(),
      })),
      count: rows.length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error listing detections:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list detections" },
      { status: 500 }
    );
  }
}
