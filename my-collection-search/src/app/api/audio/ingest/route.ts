import { NextResponse } from "next/server";
import { acceptedIngestSchema } from "@/api-contract/schemas";
import {
  IngestRejected,
  audioIngestService,
} from "@/server/services/audioIngestService";
import type { IngestErrorCode } from "@/types/audioIngest";

// Needs the filesystem and ffprobe; the edge runtime has neither.
export const runtime = "nodejs";

/**
 * Accept one audio chunk from a listener device (#275).
 *
 * The first half of automatic vinyl play tracking: a Raspberry Pi captures the
 * playback chain and posts chunks here. Everything downstream hangs off this
 * contract.
 *
 * Thin by design — validation, disk, database and queue all live in
 * `audioIngestService`. `202` rather than `200` because the answer to "what is
 * this?" is not known yet and will not be for a second or two.
 */
export async function POST(req: Request) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return reject("missing_audio_file", "expected multipart/form-data", 400);
    }

    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return reject("missing_audio_file", "an `audio` file part is required", 400);
    }

    const sourceId = form.get("source_id");
    if (typeof sourceId !== "string" || !sourceId.trim()) {
      return reject("missing_source_id", "`source_id` is required", 400);
    }

    const sequenceRaw = form.get("sequence");
    const sequence =
      typeof sequenceRaw === "string" && sequenceRaw.trim() !== ""
        ? Number(sequenceRaw)
        : null;

    const sessionId = form.get("session_id");
    const capturedAt = form.get("captured_at");

    const accepted = await audioIngestService.accept(audio, {
      source_id: sourceId,
      session_id: typeof sessionId === "string" && sessionId ? sessionId : null,
      sequence: sequence !== null && Number.isFinite(sequence) ? sequence : null,
      captured_at:
        typeof capturedAt === "string" && capturedAt ? capturedAt : null,
    });

    return NextResponse.json(acceptedIngestSchema.parse(accepted), { status: 202 });
  } catch (error) {
    if (error instanceof IngestRejected) {
      // 413 for an oversized body, 400 for everything else the device sent.
      const status = error.code === "audio_too_large" ? 413 : 400;
      return reject(error.code, error.message, status);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error accepting audio ingest:", err);
    return NextResponse.json(
      { error: "internal_error", message: err.message || "Failed to accept audio" },
      { status: 500 }
    );
  }
}

function reject(error: IngestErrorCode, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}
