import { randomUUID } from "node:crypto";
import { dbQuery } from "@/lib/serverDb";
import type { CreatePlayDetectionInput, PlayDetectionRow } from "@/types/playDetection";

const DEFAULT_RETENTION_DAYS = 30;

/** Days to retain diagnostic matcher output; set 0 to disable automatic pruning. */
export function playDetectionRetentionDays(): number {
  const configured = process.env.PLAY_DETECTIONS_RETENTION_DAYS;
  if (configured === undefined || configured === "") return DEFAULT_RETENTION_DAYS;

  const days = Number(configured);
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("PLAY_DETECTIONS_RETENTION_DAYS must be a non-negative integer");
  }
  return days;
}

export class PlayDetectionRepository {
  async create(input: CreatePlayDetectionInput): Promise<PlayDetectionRow> {
    const { rows } = await dbQuery<PlayDetectionRow>(
      `
      INSERT INTO play_detections (
        id, ingest_id, source_id, session_id, track_id, friend_id, confidence,
        offset_seconds, window_start_at, fingerprint_type, fingerprint_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        input.id ?? randomUUID(),
        input.ingest_id,
        input.source_id,
        input.session_id ?? null,
        input.track_id ?? null,
        input.friend_id ?? null,
        input.confidence ?? null,
        input.offset_seconds ?? null,
        input.window_start_at ?? null,
        input.fingerprint_type ?? null,
        input.fingerprint_version ?? null,
      ]
    );
    return rows[0];
  }

  /** All raw candidates (including no-match rows) in a source's recent window. */
  async listRecentBySource(
    sourceId: string,
    since: Date | string
  ): Promise<PlayDetectionRow[]> {
    const { rows } = await dbQuery<PlayDetectionRow>(
      `
      SELECT * FROM play_detections
      WHERE source_id = $1 AND window_start_at >= $2
      ORDER BY window_start_at ASC, id ASC
      `,
      [sourceId, since]
    );
    return rows;
  }

  /** Remove diagnostic data older than the configured retention period. */
  async pruneExpired(retentionDays = playDetectionRetentionDays()): Promise<number> {
    if (retentionDays === 0) return 0;

    const { rowCount } = await dbQuery(
      `
      DELETE FROM play_detections
      WHERE created_at < current_timestamp - ($1 * interval '1 day')
      `,
      [retentionDays]
    );
    return rowCount ?? 0;
  }
}

export const playDetectionRepository = new PlayDetectionRepository();
