import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  RecordingRejected,
  isSha256,
  setRecordingService,
} from "@/server/services/setRecordingService";

// Streams to and from the filesystem, and probes with ffprobe.
export const runtime = "nodejs";

type Params = { params: Promise<{ sha256: string }> };

/**
 * Whole set recordings, addressed by the sha256 of their bytes (#282).
 *
 * The CLI asks `HEAD` before uploading, so a recording the server already has
 * is never sent twice; `PUT` streams the raw bytes (not multipart — a 250 MB
 * file must not be buffered); `GET` serves one back, which is what a live
 * set's media entry links to.
 */
/**
 * The original filename, for display only. The CLI percent-encodes it because
 * headers are Latin-1 and a name like "Carlos Díaz.mp3" is not; a header that
 * is not valid percent-encoding is kept as sent rather than refused.
 */
function filenameFrom(req: Request): string | null {
  const raw = req.headers.get("x-filename");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function HEAD(_req: Request, { params }: Params) {
  const { sha256 } = await params;
  const recording = await setRecordingService.find(sha256);
  if (!recording) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 200,
    headers: { "Content-Length": String(recording.size_bytes) },
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { sha256 } = await params;
  const recording = await setRecordingService.find(sha256);
  if (!recording) {
    return NextResponse.json({ error: `no recording ${sha256}` }, { status: 404 });
  }
  const stream = fs.createReadStream(setRecordingService.pathOf(recording));
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(recording.size_bytes),
      "Content-Disposition": `attachment; filename="${recording.file_path}"`,
    },
  });
}

/**
 * Upload a recording under its sha256.
 *
 * `201` when stored, `200` when the server already had it (the body is not
 * read). A body whose hash does not match the path is discarded with `422`:
 * it was cut short or corrupted in transit, and the CLI should send it again.
 */
export async function PUT(req: Request, { params }: Params) {
  const { sha256 } = await params;
  if (!isSha256(sha256)) {
    return NextResponse.json(
      { error: "invalid_sha256", message: "expected a lowercase hex sha256" },
      { status: 400 }
    );
  }
  try {
    const { recording, created } = await setRecordingService.store(
      sha256,
      req.body,
      filenameFrom(req)
    );
    return NextResponse.json(recording, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof RecordingRejected) {
      const status =
        error.code === "recording_too_large" ? 413 : error.code === "hash_mismatch" ? 422 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error storing set recording:", err);
    return NextResponse.json(
      { error: "internal_error", message: err.message || "Failed to store recording" },
      { status: 500 }
    );
  }
}
