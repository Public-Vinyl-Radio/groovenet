import { dbQuery } from "@/lib/serverDb";
import type { PoolClient } from "pg";

export type Queryable = Pick<PoolClient, "query">;

export type SpinSessionRow = {
  id: number;
  friend_id: number;
  release_id: string;
  medium: "vinyl";
  selection_mode: "sides" | "tracks" | "automatic";
  played_at: Date | string;
  note: string | null;
  context_type: string | null;
  provenance: "manual" | "automatic";
  source_id: string | null;
  detection_id: string | null;
  confidence: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type SpinSessionSelectionRow = {
  id: number;
  session_id: number;
  ordinal: number;
  selection_type: "side" | "track";
  side_key: string | null;
  track_id: string | null;
  friend_id: number | null;
  position_snapshot: string | null;
  created_at: Date | string;
};

export type CreateSpinSessionInput = {
  friend_id: number;
  release_id: string;
  medium?: "vinyl";
  selection_mode: "sides" | "tracks" | "automatic";
  played_at: string | Date;
  note?: string | null;
  context_type?: string | null;
  provenance?: "manual" | "automatic";
  source_id?: string | null;
  detection_id?: string | null;
  confidence?: number | null;
};

export type CreateSpinSessionSelectionInput = {
  ordinal: number;
  selection_type: "side" | "track";
  side_key?: string | null;
  track_id?: string | null;
  friend_id?: number | null;
  position_snapshot?: string | null;
};

export type ListSpinSessionsFilters = {
  friend_id: number;
  release_id?: string;
  track_id?: string;
  limit?: number;
  offset?: number;
  from?: string | Date;
  to?: string | Date;
};

export class SpinSessionRepository {
  async createSession(
    client: Queryable,
    input: CreateSpinSessionInput
  ): Promise<SpinSessionRow> {
    const { rows } = await client.query<SpinSessionRow>(
      `
      INSERT INTO spin_sessions (
        friend_id, release_id, medium, selection_mode, played_at, note, context_type,
        provenance, source_id, detection_id, confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        input.friend_id,
        input.release_id,
        input.medium ?? "vinyl",
        input.selection_mode,
        input.played_at,
        input.note ?? null,
        input.context_type ?? null,
        input.provenance ?? "manual",
        input.source_id ?? null,
        input.detection_id ?? null,
        input.confidence ?? null,
      ]
    );

    return rows[0];
  }

  async findAutomaticSessionByDetectionId(detectionId: string): Promise<SpinSessionRow | null> {
    const { rows } = await dbQuery<SpinSessionRow>(
      "SELECT * FROM spin_sessions WHERE detection_id = $1",
      [detectionId]
    );
    return rows[0] ?? null;
  }

  async insertSelections(
    client: Queryable,
    sessionId: number,
    selections: CreateSpinSessionSelectionInput[]
  ): Promise<SpinSessionSelectionRow[]> {
    if (selections.length === 0) return [];

    const values: string[] = [];
    const params: Array<number | string | null> = [sessionId];
    let paramIndex = 2;

    for (const selection of selections) {
      values.push(
        `($1, $${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
      );
      params.push(
        selection.ordinal,
        selection.selection_type,
        selection.side_key ?? null,
        selection.track_id ?? null,
        selection.friend_id ?? null,
        selection.position_snapshot ?? null
      );
      paramIndex += 6;
    }

    const { rows } = await client.query<SpinSessionSelectionRow>(
      `
      INSERT INTO spin_session_selections (
        session_id, ordinal, selection_type, side_key, track_id, friend_id, position_snapshot
      )
      VALUES ${values.join(", ")}
      RETURNING *
      `,
      params
    );

    return rows;
  }

  async listSessions(
    filters: ListSpinSessionsFilters
  ): Promise<Array<SpinSessionRow & { track_event_count: number }>> {
    const whereClauses = ["ss.friend_id = $1"];
    const params: Array<number | string | Date> = [filters.friend_id];

    if (filters.release_id) {
      params.push(filters.release_id);
      whereClauses.push(`ss.release_id = $${params.length}`);
    }
    if (filters.track_id) {
      params.push(filters.track_id);
      whereClauses.push(
        `EXISTS (
          SELECT 1
          FROM track_spin_events tse_filter
          WHERE tse_filter.session_id = ss.id
            AND tse_filter.track_id = $${params.length}
        )`
      );
    }
    if (filters.from) {
      params.push(filters.from);
      whereClauses.push(`ss.played_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      whereClauses.push(`ss.played_at <= $${params.length}`);
    }

    params.push(filters.limit ?? 50);
    const limitRef = `$${params.length}`;
    params.push(filters.offset ?? 0);
    const offsetRef = `$${params.length}`;

    const { rows } = await dbQuery<SpinSessionRow & { track_event_count: number }>(
      `
      SELECT
        ss.*,
        COUNT(tse.id)::int AS track_event_count
      FROM spin_sessions ss
      LEFT JOIN track_spin_events tse ON tse.session_id = ss.id
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY ss.id
      ORDER BY ss.played_at DESC, ss.id DESC
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
      `,
      params
    );

    return rows;
  }

  async listSelectionsBySessionIds(
    sessionIds: number[]
  ): Promise<SpinSessionSelectionRow[]> {
    if (sessionIds.length === 0) return [];

    const { rows } = await dbQuery<SpinSessionSelectionRow>(
      `
      SELECT *
      FROM spin_session_selections
      WHERE session_id = ANY($1::int[])
      ORDER BY session_id ASC, ordinal ASC, id ASC
      `,
      [sessionIds]
    );

    return rows;
  }

  async deleteSession(
    client: Queryable,
    sessionId: number,
    friendId: number
  ): Promise<SpinSessionRow | null> {
    const { rows } = await client.query<SpinSessionRow>(
      `
      DELETE FROM spin_sessions
      WHERE id = $1 AND friend_id = $2
      RETURNING *
      `,
      [sessionId, friendId]
    );

    return rows[0] ?? null;
  }
}

export const spinSessionRepository = new SpinSessionRepository();
