import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  setRecordingRepository,
  type SetRecordingRepository,
} from "@/server/repositories/setRecordingRepository";
import {
  AudioProcessor,
  InvalidAudioError,
  audioProcessor,
} from "@/server/services/audioProcessor";
import type { SetRecordingRow } from "@/types/setDerivation";

/**
 * Whole set recordings, uploaded by the CLI and stored by content (#282).
 *
 * The CLI hashes a recording locally and asks whether the server already has
 * it before sending a byte; if not, it streams the raw bytes here under that
 * hash. The body is written straight to disk and hashed as it goes, and only a
 * body whose hash matches the name it was sent under is kept — so a truncated
 * or corrupted upload can never become a recording the matcher reads.
 */

export type RecordingErrorCode =
  | "invalid_sha256"
  | "empty_upload"
  | "recording_too_large"
  | "hash_mismatch"
  | "invalid_audio";

export class RecordingRejected extends Error {
  constructor(
    readonly code: RecordingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RecordingRejected";
  }
}

export function setRecordingsDir(): string {
  return path.resolve(process.env.SET_RECORDINGS_DIR || "/app/set-recordings");
}

/** 2 GiB: a long night as lossless audio, with room to spare. */
export function maxRecordingBytes(): number {
  const parsed = Number(process.env.SET_RECORDING_MAX_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 1024 ** 3;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function isSha256(value: string): boolean {
  return SHA256.test(value);
}

/**
 * The extension a recording is stored under, from what ffprobe found.
 *
 * Never the uploaded filename — an extension is a claim, not evidence. The
 * worker hands the file to ffmpeg, which reads the content anyway; this only
 * keeps the volume legible.
 */
export function extensionFor(formatName: string | null): string {
  const first = (formatName ?? "").split(",")[0].trim().toLowerCase();
  const mapped = first === "matroska" ? "mkv" : first === "mov" ? "m4a" : first;
  return /^[a-z0-9]{1,10}$/.test(mapped) ? mapped : "audio";
}

export class SetRecordingService {
  constructor(
    private repository: Pick<SetRecordingRepository, "findBySha256" | "create"> = setRecordingRepository,
    private processor: Pick<AudioProcessor, "probe"> = audioProcessor
  ) {}

  async find(sha256: string): Promise<SetRecordingRow | null> {
    if (!isSha256(sha256)) return null;
    return this.repository.findBySha256(sha256);
  }

  /** Absolute path of a stored recording, confined to the volume. */
  pathOf(recording: SetRecordingRow): string {
    const root = setRecordingsDir();
    const target = path.resolve(root, recording.file_path);
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`${recording.file_path} resolves outside ${root}`);
    }
    return target;
  }

  /**
   * Store an uploaded recording under its sha256.
   *
   * Idempotent: a recording already held is returned as-is (`created: false`)
   * and the body is not read.
   */
  async store(
    sha256: string,
    body: ReadableStream<Uint8Array> | null,
    originalFilename: string | null
  ): Promise<{ recording: SetRecordingRow; created: boolean }> {
    if (!isSha256(sha256)) {
      throw new RecordingRejected("invalid_sha256", "expected a lowercase hex sha256");
    }

    const existing = await this.repository.findBySha256(sha256);
    if (existing) {
      await body?.cancel().catch(() => {});
      return { recording: existing, created: false };
    }
    if (!body) throw new RecordingRejected("empty_upload", "the request has no body");

    const dir = setRecordingsDir();
    await fsp.mkdir(dir, { recursive: true });
    const tempPath = path.join(dir, `.incoming-${randomUUID()}`);

    try {
      const { digest, size } = await writeHashed(body, tempPath, maxRecordingBytes());
      if (size === 0) throw new RecordingRejected("empty_upload", "the upload was empty");
      if (digest !== sha256) {
        throw new RecordingRejected(
          "hash_mismatch",
          `the upload hashed to ${digest}, not ${sha256}; it was truncated or corrupted in transit`
        );
      }

      let probed;
      try {
        probed = await this.processor.probe(tempPath);
      } catch (error) {
        if (error instanceof InvalidAudioError) {
          throw new RecordingRejected("invalid_audio", error.message);
        }
        throw error;
      }

      const filePath = `${sha256}.${extensionFor(probed.formatName)}`;
      await fsp.rename(tempPath, path.join(dir, filePath));
      const recording = await this.repository.create({
        sha256,
        file_path: filePath,
        original_filename: originalFilename,
        format_name: probed.formatName,
        duration_seconds: probed.durationSeconds,
        size_bytes: size,
      });
      return { recording, created: true };
    } finally {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

/**
 * Stream a body to `target`, hashing as it writes and refusing it the moment
 * it passes `maxBytes`. Nothing is buffered beyond one chunk.
 */
export async function writeHashed(
  body: ReadableStream<Uint8Array>,
  target: string,
  maxBytes: number
): Promise<{ digest: string; size: number }> {
  const hash = createHash("sha256");
  const out = fs.createWriteStream(target);
  let size = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        throw new RecordingRejected(
          "recording_too_large",
          `upload exceeds ${maxBytes} bytes`
        );
      }
      hash.update(value);
      if (!out.write(value)) {
        await new Promise<void>((resolve) => out.once("drain", resolve));
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    // Wait for the close: the file is opened asynchronously, and a stream
    // destroyed mid-open can create it after the caller's cleanup has run.
    const closed = once(out, "close");
    out.destroy();
    await closed;
    throw error;
  }
  out.end();
  await finished(out);
  return { digest: hash.digest("hex"), size };
}

export const setRecordingService = new SetRecordingService();
