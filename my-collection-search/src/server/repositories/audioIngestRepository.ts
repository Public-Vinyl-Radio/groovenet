import { randomUUID } from "node:crypto";
import { dbQuery } from "@/lib/serverDb";

export type AudioIngestStatus = "received" | "processing" | "processed" | "failed";

export type AudioIngestRow = {
  id: string;
  source_id: string;
  session_id: string | null;
  sequence: string | number | null;
  captured_at: Date | string | null;
  received_at: Date | string;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  codec: string | null;
  file_path: string | null;
  status: AudioIngestStatus;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CreateAudioIngestInput = {
  id?: string;
  source_id: string;
  session_id?: string | null;
  sequence?: number | null;
  captured_at?: Date | string | null;
  received_at?: Date | string;
  duration_seconds?: number | null;
  sample_rate?: number | null;
  channels?: number | null;
  codec?: string | null;
  file_path?: string | null;
  status?: AudioIngestStatus;
  error?: string | null;
};

export type ListAudioIngestsOptions = {
  limit?: number;
  offset?: number;
};

export class AudioIngestRepository {
  async create(input: CreateAudioIngestInput): Promise<AudioIngestRow> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      INSERT INTO audio_ingests (
        id, source_id, session_id, sequence, captured_at, received_at,
        duration_seconds, sample_rate, channels, codec, file_path, status, error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.source_id,
        input.session_id ?? null,
        input.sequence ?? null,
        input.captured_at ?? null,
        input.received_at ?? new Date(),
        input.duration_seconds ?? null,
        input.sample_rate ?? null,
        input.channels ?? null,
        input.codec ?? null,
        input.file_path ?? null,
        input.status ?? "received",
        input.error ?? null,
      ]
    );
    return rows[0];
  }

  async updateStatus(
    id: string,
    status: AudioIngestStatus,
    error: string | null = null
  ): Promise<AudioIngestRow | null> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      UPDATE audio_ingests
      SET status = $2, error = $3, updated_at = current_timestamp
      WHERE id = $1
      RETURNING *
      `,
      [id, status, error]
    );
    return rows[0] ?? null;
  }

  async findByDedupeKey(
    sourceId: string,
    sessionId: string,
    sequence: number
  ): Promise<AudioIngestRow | null> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      SELECT * FROM audio_ingests
      WHERE source_id = $1 AND session_id = $2 AND sequence = $3
      `,
      [sourceId, sessionId, sequence]
    );
    return rows[0] ?? null;
  }

  /**
   * The records claiming any of these files, for the retention sweeper (#269).
   *
   * Keyed on the file names actually present on the ingest volume rather than
   * scanning the table: the volume is transient and small, while `audio_ingests`
   * is the durable history and grows without bound. A file with no row returned
   * here is an orphan candidate.
   */
  async findByFilePaths(filePaths: string[]): Promise<AudioIngestRow[]> {
    if (filePaths.length === 0) return [];
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      SELECT * FROM audio_ingests
      WHERE file_path = ANY($1::text[])
      `,
      [filePaths]
    );
    return rows;
  }

  /**
   * Ingests that have sat in a non-terminal state too long (#276).
   *
   * Two states, deliberately: `received` means nothing ever picked the chunk
   * up — the worker is down or the queue was lost — while `processing` means
   * something took it and never came back. Both strand a file, and telling
   * them apart is the difference between "restart the worker" and "the worker
   * is crashing on this audio".
   */
  async listStale(
    olderThan: Date,
    statuses: AudioIngestStatus[] = ["received", "processing"],
    limit = 500
  ): Promise<AudioIngestRow[]> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      SELECT * FROM audio_ingests
      WHERE status = ANY($1::text[])
        AND updated_at < $2
      ORDER BY updated_at ASC
      LIMIT $3
      `,
      [statuses, olderThan, limit]
    );
    return rows;
  }

  async findById(id: string): Promise<AudioIngestRow | null> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `SELECT * FROM audio_ingests WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /**
   * Move an ingest to a new status only if it is currently in one of
   * `from`, returning null when it was not.
   *
   * The guard is what makes the reaper safe to run beside a live worker: a
   * chunk that finished a millisecond before the deadline must not be dragged
   * back to `failed` on top of its real result.
   */
  async transitionStatus(
    id: string,
    to: AudioIngestStatus,
    from: AudioIngestStatus[],
    error: string | null = null
  ): Promise<AudioIngestRow | null> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      UPDATE audio_ingests
      SET status = $2, error = $3, updated_at = current_timestamp
      WHERE id = $1 AND status = ANY($4::text[])
      RETURNING *
      `,
      [id, to, error, from]
    );
    return rows[0] ?? null;
  }

  async listBySource(
    sourceId: string,
    { limit = 50, offset = 0 }: ListAudioIngestsOptions = {}
  ): Promise<AudioIngestRow[]> {
    const { rows } = await dbQuery<AudioIngestRow>(
      `
      SELECT * FROM audio_ingests
      WHERE source_id = $1
      ORDER BY received_at DESC, id DESC
      LIMIT $2 OFFSET $3
      `,
      [sourceId, limit, offset]
    );
    return rows;
  }
}

export const audioIngestRepository = new AudioIngestRepository();
