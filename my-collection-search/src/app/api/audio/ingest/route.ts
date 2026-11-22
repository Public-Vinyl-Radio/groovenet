import { RATE_LIMIT_POLICIES, withRateLimit } from "@/server/security/rateLimit";
import { NextResponse } from "next/server";
import { acceptedIngestSchema } from "@/api-contract/schemas";
import { logIngestEvent, type IngestLogFields } from "@/lib/ingestLog";
import {
  IngestFailure,
  IngestRejected,
  audioIngestService,
} from "@/server/services/audioIngestService";
import { ingestMetricsService } from "@/server/services/ingestMetricsService";
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
 *
 * Every refusal is counted and logged here, including the ones the service
 * raises, so "chunks rejected, by reason" has exactly one place to come from
 * (#280). The accepted line is the service's, which knows what ffprobe found.
 */
async function handlePost(req: Request) {
  const startedAt = Date.now();
  ingestMetricsService.chunkReceived();
  // What is known about the chunk so far, for whichever line ends up written.
  const context: IngestLogFields = {};
  const refuse = (error: IngestErrorCode, message: string, status: number) => {
    ingestMetricsService.chunkRejected(error);
    logIngestEvent(
      "ingest.rejected",
      {
        ...context,
        stage: stageOf(error),
        reason: error,
        error: message,
        processing_ms: Date.now() - startedAt,
      },
      "warn",
    );
    return reject(error, message, status);
  };

  try {
    let form: FormData;
    const upload = watchUpload(req);
    try {
      form = await upload.request.formData();
    } catch {
      // A body that never fully arrived is the network's fault, not the
      // chunk's: say so, and let the device keep the audio and retry (#1224).
      if (upload.incomplete()) {
        return refuse(
          "upload_incomplete",
          "the request body ended before it was complete; retry the upload",
          408,
        );
      }
      return refuse("missing_audio_file", "expected multipart/form-data", 400);
    }

    const audio = form.get("audio");
    if (audio instanceof File) context.size_bytes = audio.size;
    const sourceId = form.get("source_id");
    if (typeof sourceId === "string" && sourceId.trim()) context.source_id = sourceId.trim();

    if (!(audio instanceof File) || audio.size === 0) {
      return refuse("missing_audio_file", "an `audio` file part is required", 400);
    }

    if (typeof sourceId !== "string" || !sourceId.trim()) {
      return refuse("missing_source_id", "`source_id` is required", 400);
    }

    const sequenceRaw = form.get("sequence");
    const sequence =
      typeof sequenceRaw === "string" && sequenceRaw.trim() !== "" ? Number(sequenceRaw) : null;

    const sessionId = form.get("session_id");
    const capturedAt = form.get("captured_at");
    context.session_id = typeof sessionId === "string" && sessionId ? sessionId : null;
    context.sequence = sequence !== null && Number.isFinite(sequence) ? sequence : null;

    const accepted = await audioIngestService.accept(audio, {
      source_id: sourceId,
      session_id: typeof sessionId === "string" && sessionId ? sessionId : null,
      sequence: sequence !== null && Number.isFinite(sequence) ? sequence : null,
      captured_at: typeof capturedAt === "string" && capturedAt ? capturedAt : null,
    });

    return NextResponse.json(acceptedIngestSchema.parse(accepted), { status: 202 });
  } catch (error) {
    if (error instanceof IngestRejected) {
      // 413 for an oversized body, 400 for everything else the device sent.
      const status = error.code === "audio_too_large" ? 413 : 400;
      return refuse(error.code, error.message, status);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    const stage = error instanceof IngestFailure ? error.stage : "upload";
    ingestMetricsService.chunkFailed(stage);
    logIngestEvent(
      "ingest.error",
      { ...context, stage, error: err.message, processing_ms: Date.now() - startedAt },
      "error",
    );
    // The stack, separately: useful to a person, and never carries the upload.
    console.error(err.cause ?? err);
    return NextResponse.json(
      { error: "internal_error", message: err.message || "Failed to accept audio" },
      { status: 500 },
    );
  }
}

/**
 * Wrap a request so a failed `formData()` can be told apart: body never arrived
 * in full, or arrived in full and is wrong.
 *
 * What the runtime throws does not separate them on its own. An aborted or
 * timed-out connection errors the body stream, and that error comes out of
 * `formData()` as-is (Node: `ECONNRESET`, "aborted"). A body that simply ends
 * early — a proxy cutting it off — is a `TypeError: Failed to parse body as
 * FormData`, identical to a complete body that is malformed. So the stream is
 * observed: it errored, or it ended with fewer bytes than `Content-Length`
 * promised, means incomplete. Anything else is the device's mistake.
 */
function watchUpload(req: Request): { request: Request; incomplete: () => boolean } {
  if (!req.body) return { request: req, incomplete: () => false };
  const declared = Number(req.headers.get("content-length"));
  const reader = req.body.getReader();
  let received = 0;
  let errored = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        received += value.byteLength;
        controller.enqueue(value);
      } catch (error) {
        errored = true;
        controller.error(error);
      }
    },
  });
  const request = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
    duplex: "half",
  } as RequestInit);
  return {
    request,
    incomplete: () =>
      errored ||
      (req.headers.has("content-length") && Number.isFinite(declared) && received < declared),
  };
}

/** Refused before the bytes were looked at, or because of what they turned out to be. */
function stageOf(code: IngestErrorCode): "upload" | "validation" {
  return code === "missing_audio_file" ||
    code === "missing_source_id" ||
    code === "audio_too_large" ||
    code === "upload_incomplete"
    ? "upload"
    : "validation";
}

function reject(error: IngestErrorCode, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

export const POST = withRateLimit(RATE_LIMIT_POLICIES.audioIngest, handlePost);
