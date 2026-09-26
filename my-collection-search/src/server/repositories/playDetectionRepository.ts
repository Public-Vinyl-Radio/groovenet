import { randomUUID } from "node:crypto";
import { dbQuery } from "@/lib/serverDb";
import type {
  CreatePlayDetectionInput,
  DetectionConfidenceBand,
  PlayDetectionRow,
  PlayDetectionWithTrack,
  RecentDetectionFilters,
} from "@/types/playDetection";

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
        offset_seconds, window_start_at, fingerprint_type, fingerprint_version,
        level_dbfs
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        input.level_dbfs ?? null,
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

  /**
   * The newest windows, with the track they matched resolved (#299).
   *
   * Left joined, and no-match rows are **included**: a null `track_id` is a
   * recorded window that matched nothing, which is data — it is how a gap
   * between one play and the next is found — not an absence to filter out.
   */
  async listRecent(
    filters: RecentDetectionFilters = {}
  ): Promise<PlayDetectionWithTrack[]> {
    const params: Array<string | number> = [];
    const where: string[] = [];

    if (filters.source_id) {
      params.push(filters.source_id);
      where.push(`d.source_id = $${params.length}`);
    }
    if (filters.session_id) {
      params.push(filters.session_id);
      where.push(`d.session_id = $${params.length}`);
    }
    if (filters.matched === true) where.push("d.track_id IS NOT NULL");
    if (filters.matched === false) where.push("d.track_id IS NULL");
    if (filters.since) {
      params.push(filters.since);
      where.push(`d.created_at >= $${params.length}`);
    }

    params.push(filters.limit ?? 50);
    const limit = `$${params.length}`;
    params.push(filters.offset ?? 0);
    const offset = `$${params.length}`;

    const { rows } = await dbQuery<PlayDetectionWithTrack>(
      `
      SELECT
        d.id, d.ingest_id, d.source_id, d.session_id, d.track_id, d.friend_id,
        d.confidence, d.offset_seconds, d.level_dbfs, d.window_start_at,
        d.fingerprint_type, d.fingerprint_version, d.created_at,
        t.title  AS track_title,
        t.artist AS track_artist,
        t.album  AS track_album
      FROM play_detections d
      LEFT JOIN tracks t
        ON t.track_id = d.track_id AND t.friend_id = d.friend_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY d.window_start_at DESC NULLS LAST, d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );
    return rows;
  }

  /**
   * Distinct sources with any detection since `since` (#304).
   *
   * Feeds the periodic aggregation backstop, which needs to know what to
   * check without scanning the whole table. Includes no-match rows too —
   * cheaper than filtering them out here, and `aggregateSource`'s own dedup
   * makes checking a source with nothing new to aggregate free.
   */
  async listActiveSourceIds(since: Date | string): Promise<string[]> {
    const { rows } = await dbQuery<{ source_id: string }>(
      `
      SELECT DISTINCT source_id
      FROM play_detections
      WHERE window_start_at >= $1
      `,
      [since]
    );
    return rows.map((row) => row.source_id);
  }

  /**
   * Matched / no-match counts and the confidence spread over a window (#299).
   *
   * The bands matter more than an average: #271 found a clean bimodal split,
   * so a healthy run is a pile of high-confidence matches and some no-matches,
   * with very little in between. A cluster hovering just above the threshold
   * is the shape that says something is wrong.
   */
  async statsSince(since: Date | string, sourceId?: string): Promise<{
    windows: number;
    matched: number;
    noMatch: number;
    bands: DetectionConfidenceBand[];
  }> {
    const params: Array<string | number | Date> = [since];
    let scope = "created_at >= $1";
    if (sourceId) {
      params.push(sourceId);
      scope += ` AND source_id = $${params.length}`;
    }

    const { rows } = await dbQuery<{
      windows: string;
      matched: string;
      no_match: string;
    }>(
      `
      SELECT
        COUNT(*)::text                                        AS windows,
        COUNT(*) FILTER (WHERE track_id IS NOT NULL)::text    AS matched,
        COUNT(*) FILTER (WHERE track_id IS NULL)::text        AS no_match
      FROM play_detections
      WHERE ${scope}
      `,
      params
    );

    const { rows: bandRows } = await dbQuery<{ band: string; count: string }>(
      `
      SELECT
        CASE
          WHEN confidence >= 0.9  THEN '0.90-1.00'
          WHEN confidence >= 0.8  THEN '0.80-0.90'
          WHEN confidence >= 0.75 THEN '0.75-0.80'
          ELSE '<0.75'
        END AS band,
        COUNT(*)::text AS count
      FROM play_detections
      WHERE ${scope} AND confidence IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
      `,
      params
    );

    return {
      windows: Number(rows[0]?.windows ?? 0),
      matched: Number(rows[0]?.matched ?? 0),
      noMatch: Number(rows[0]?.no_match ?? 0),
      bands: bandRows.map((r) => ({ band: r.band, count: Number(r.count) })),
    };
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
