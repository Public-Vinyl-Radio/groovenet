import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  errorMessage,
  logIngestEvent,
  type IngestStage,
} from "@/lib/ingestLog";
import { getRedisConnection } from "@/lib/redis";
import {
  audioIngestRepository,
  type AudioIngestRow,
} from "@/server/repositories/audioIngestRepository";
import {
  AudioProcessor,
  InvalidAudioError,
  audioProcessor,
  type ProbedAudio,
} from "@/server/services/audioProcessor";
import { ensureIngestDir, ingestDir } from "@/server/services/ingestSweeperService";
import { ingestMetricsService } from "@/server/services/ingestMetricsService";
import type {
  AcceptedIngest,
  IngestErrorCode,
  IngestLimits,
  IngestRequestFields,
} from "@/types/audioIngest";

/**
 * The queue `fingerprint-service` pops. Deliberately not `download_queue`,
 * where multi-minute downloads would head-of-line block a 15-second window.
 */
export const FINGERPRINT_QUEUE_KEY =
  process.env.FINGERPRINT_QUEUE_KEY || "fingerprint_queue";

/** Thrown for anything the device did wrong, carrying the code it will read. */
export class IngestRejected extends Error {
  constructor(
    readonly code: IngestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "IngestRejected";
  }
}

/**
 * Something the app itself failed on, named by the stage it failed at (#280).
 *
 * Not the device's fault — the route still answers 500 — but "the upload
 * failed" and "the database write failed" send you to very different places.
 */
export class IngestFailure extends Error {
  constructor(
    readonly stage: IngestStage,
    cause: unknown
  ) {
    super(errorMessage(cause), { cause });
    this.name = "IngestFailure";
  }
}

/** Run one stage, tagging anything unexpected it throws with the stage's name. */
async function atStage<T>(stage: IngestStage, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof IngestRejected || error instanceof IngestFailure) throw error;
    throw new IngestFailure(stage, error);
  }
}

export function loadIngestLimits(): IngestLimits {
  const number = (raw: string | undefined, fallback: number) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    maxBytes: number(process.env.AUDIO_INGEST_MAX_UPLOAD_BYTES, 20 * 1024 * 1024),
    minDurationSeconds: number(process.env.AUDIO_INGEST_MIN_DURATION_SECONDS, 3),
    maxDurationSeconds: number(process.env.AUDIO_INGEST_MAX_DURATION_SECONDS, 60),
  };
}

/**
 * Containers a listener device may send.
 *
 * Checked against what ffprobe *found*, never the filename — an extension is a
 * claim, not evidence. Kept permissive on purpose: the point is to reject
 * obvious nonsense early, and ffprobe's own verdict is the real gate.
 */
const SUPPORTED_FORMATS = ["wav", "flac", "ogg", "opus", "matroska", "webm", "mp3"];

/**
 * The extension to store an accepted chunk under.
 *
 * Only ever called after `assertWithinLimits`, which rejects a null or
 * unsupported container — so `formatName` is known to be present and known to
 * be one of SUPPORTED_FORMATS by the time this runs.
 */
function extensionFor(probed: ProbedAudio): string {
  const format = (probed.formatName as string).split(",")[0];
  return format === "matroska" || format === "webm" ? "webm" : format;
}

function isSupported(probed: ProbedAudio): boolean {
  const formats = (probed.formatName ?? "").split(",");
  return formats.some((format) => SUPPORTED_FORMATS.includes(format.trim()));
}

/**
 * Accepting one audio chunk from a listener device (#275).
 *
 * Validate, persist, record, enqueue — in that order, and with the file on
 * disk before it is inspected, because ffprobe needs a path. Everything that
 * touches the filesystem, the database or Redis lives here rather than in the
 * route handler.
 */
export class AudioIngestService {
  private redis = getRedisConnection();

  constructor(private processor: AudioProcessor = audioProcessor) {}

  /**
   * Stream an upload to a temp file, refusing it the moment it is too big.
   *
   * Streamed rather than buffered because the limit is 20 MB per chunk and
   * several devices may post at once; reading each body into memory to measure
   * it would be the easy way to fall over. The size is enforced *during* the
   * write for the same reason.
   */
  private async streamToTemp(file: File, limits: IngestLimits): Promise<string> {
    const dir = ensureIngestDir();
    const tempPath = path.join(dir, `.incoming-${randomUUID()}`);
    const handle = await fsp.open(tempPath, "w");
    let written = 0;

    try {
      const reader = file.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value as Uint8Array;
        written += chunk.byteLength;
        if (written > limits.maxBytes) {
          throw new IngestRejected(
            "audio_too_large",
            `upload exceeds ${limits.maxBytes} bytes`
          );
        }
        await handle.write(chunk);
      }
    } catch (error) {
      await handle.close();
      await fsp.rm(tempPath, { force: true });
      throw error;
    }

    await handle.close();
    return tempPath;
  }

  private async discard(tempPath: string): Promise<void> {
    // A rejected upload must not linger: the sweeper would eventually take it
    // (#269), but leaving litter for it to find is not a reason to make litter.
    await fsp.rm(tempPath, { force: true }).catch(() => {});
  }

  /** Validate a probed chunk against the configured limits. */
  private assertWithinLimits(probed: ProbedAudio, limits: IngestLimits): void {
    if (!isSupported(probed)) {
      throw new IngestRejected(
        "unsupported_audio_format",
        `${probed.formatName ?? "unknown"} is not a supported container`
      );
    }
    if (probed.durationSeconds < limits.minDurationSeconds) {
      throw new IngestRejected(
        "audio_too_short",
        `${probed.durationSeconds.toFixed(2)}s is under the ${limits.minDurationSeconds}s minimum`
      );
    }
    if (probed.durationSeconds > limits.maxDurationSeconds) {
      throw new IngestRejected(
        "audio_too_long",
        `${probed.durationSeconds.toFixed(2)}s is over the ${limits.maxDurationSeconds}s maximum`
      );
    }
  }

  /**
   * The whole accept path.
   *
   * Idempotent on `(source_id, session_id, sequence)`: the Pi retries on
   * network loss, and a retry that already landed must return the original
   * `ingest_id` rather than a duplicate row and a second copy of the audio.
   */
  async accept(
    file: File,
    fields: IngestRequestFields,
    limits: IngestLimits = loadIngestLimits()
  ): Promise<AcceptedIngest> {
    const startedAt = Date.now();
    if (!fields.source_id?.trim()) {
      throw new IngestRejected("missing_source_id", "source_id is required");
    }

    const existing = await atStage("store", () => this.findDuplicate(fields));
    if (existing) {
      ingestMetricsService.chunkDuplicate();
      logIngestEvent("ingest.duplicate", {
        ...this.identify(existing),
        duplicate: true,
        status: existing.status,
        size_bytes: file.size,
        processing_ms: Date.now() - startedAt,
      });
      return this.describe(existing);
    }

    const tempPath = await atStage("upload", () => this.streamToTemp(file, limits));

    let probed: ProbedAudio;
    try {
      probed = await this.processor.probe(tempPath);
      this.assertWithinLimits(probed, limits);
    } catch (error) {
      await this.discard(tempPath);
      if (error instanceof IngestRejected) throw error;
      if (error instanceof InvalidAudioError) {
        throw new IngestRejected("invalid_audio_stream", error.message);
      }
      throw new IngestFailure("validation", error);
    }

    const ingestId = randomUUID();
    const { row, relativePath } = await atStage("store", async () => {
      const relativePath = await this.store(tempPath, ingestId, probed);
      const row = await audioIngestRepository.create({
        id: ingestId,
        source_id: fields.source_id.trim(),
        session_id: fields.session_id ?? null,
        sequence: fields.sequence ?? null,
        captured_at: fields.captured_at ?? null,
        received_at: new Date(),
        duration_seconds: probed.durationSeconds,
        sample_rate: probed.sampleRate,
        channels: probed.channels,
        codec: probed.codec,
        file_path: relativePath,
        status: "received",
      });
      return { row, relativePath };
    });

    const queueDepth = await this.enqueue(row, probed, relativePath);
    ingestMetricsService.chunkAccepted();
    // One line at acceptance; `ingestLifecycleService` writes the terminal one.
    logIngestEvent("ingest.accepted", {
      ...this.identify(row),
      status: row.status,
      size_bytes: file.size,
      duration_seconds: probed.durationSeconds,
      sample_rate: probed.sampleRate,
      channels: probed.channels,
      codec: probed.codec,
      captured_at: row.captured_at ? new Date(row.captured_at).toISOString() : null,
      queue_depth: queueDepth,
      processing_ms: Date.now() - startedAt,
    });
    return this.describe(row);
  }

  private identify(row: AudioIngestRow) {
    return {
      ingest_id: row.id,
      source_id: row.source_id,
      session_id: row.session_id,
      sequence: row.sequence === null ? null : Number(row.sequence),
    };
  }

  private async findDuplicate(
    fields: IngestRequestFields
  ): Promise<AudioIngestRow | null> {
    if (!fields.session_id || fields.sequence === null || fields.sequence === undefined) {
      return null;
    }
    return audioIngestRepository.findByDedupeKey(
      fields.source_id.trim(),
      fields.session_id,
      fields.sequence
    );
  }

  /** Move the accepted upload into its final, dated place on the volume. */
  private async store(
    tempPath: string,
    ingestId: string,
    probed: ProbedAudio
  ): Promise<string> {
    const day = new Date().toISOString().slice(0, 10);
    const relativePath = path.join(day, `${ingestId}.${extensionFor(probed)}`);
    const target = path.join(ingestDir(), relativePath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(tempPath, target);
    return relativePath;
  }

  /**
   * Hand the chunk to `fingerprint-service`.
   *
   * A failed enqueue is logged, not raised: the row exists and the file is on
   * disk, so the work is recoverable, and answering 500 would make the device
   * retry an upload that was in fact accepted.
   *
   * Returns the queue depth after the push — LPUSH answers it for free — or
   * null when the push failed.
   */
  private async enqueue(
    row: AudioIngestRow,
    probed: ProbedAudio,
    relativePath: string
  ): Promise<number | null> {
    try {
      return await this.redis.lpush(
        FINGERPRINT_QUEUE_KEY,
        JSON.stringify({
          ingest_id: row.id,
          source_id: row.source_id,
          session_id: row.session_id,
          sequence: row.sequence === null ? null : Number(row.sequence),
          captured_at: row.captured_at
            ? new Date(row.captured_at).toISOString()
            : null,
          file_path: relativePath,
          duration_seconds: probed.durationSeconds,
          sample_rate: probed.sampleRate,
          channels: probed.channels,
          codec: probed.codec,
          // So fingerprint-service can log how long the job waited (#280).
          enqueued_at: new Date().toISOString(),
        })
      );
    } catch (error) {
      ingestMetricsService.enqueueFailed();
      logIngestEvent(
        "ingest.enqueue_failed",
        { ...this.identify(row), stage: "enqueue", error: errorMessage(error) },
        "error"
      );
      return null;
    }
  }

  private describe(row: AudioIngestRow): AcceptedIngest {
    return {
      status: "accepted",
      ingest_id: row.id,
      source_id: row.source_id,
      duration_seconds: row.duration_seconds ?? 0,
      sample_rate: row.sample_rate,
      channels: row.channels,
      captured_at: row.captured_at
        ? new Date(row.captured_at).toISOString()
        : null,
    };
  }
}

export const audioIngestService = new AudioIngestService();
