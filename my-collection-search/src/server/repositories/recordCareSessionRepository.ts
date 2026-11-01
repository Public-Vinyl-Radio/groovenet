import { coverUrlSql } from "@/server/repositories/coverUrlSql";
import { dbQuery } from "@/lib/serverDb";
import type {
  RecordActionType,
  RecordCareLogEntry,
  RecordCareSession,
  RecordCareSessionStatus,
  RecordCareSource,
  RecordCareStackItem,
} from "@groovenet/contracts";
import type { Queryable } from "./recordCopyRepository";

/** A session row before its items are attached and timestamps normalised. */
export type RecordCareSessionRow = Omit<
  RecordCareSession,
  "items" | "created_at" | "logged_at" | "voided_at"
> & {
  created_at: Date | string;
  logged_at: Date | string | null;
  voided_at: Date | string | null;
};

export type RecordCareStackItemRow = Omit<RecordCareStackItem, "last_cleaned_at"> & {
  session_id: number;
  last_cleaned_at: Date | string | null;
};

export type RecordCareLogRow = Omit<RecordCareLogEntry, "occurred_at" | "action_types"> & {
  occurred_at: Date | string;
  action_types: RecordActionType[];
};

export type RecordCareSessionItemInput = { release_id: string; copy_id: number | null };

// The pool, for reads outside a transaction.
const pool: Queryable = { query: dbQuery } as unknown as Queryable;

export class RecordCareSessionRepository {
  /**
   * Serialise stack pulls and reopens for one friend until the transaction
   * ends, so two pulls at once cannot both see "no open stack". The partial
   * unique index on open stacks is the backstop.
   */
  async lockFriendStacks(client: Queryable, friendId: number): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('record_care_stacks'), $1)", [
      friendId,
    ]);
  }

  async findOpenStack(client: Queryable, friendId: number): Promise<RecordCareSessionRow | null> {
    const { rows } = await client.query<RecordCareSessionRow>(
      "SELECT * FROM record_care_sessions WHERE friend_id = $1 AND status = 'open'",
      [friendId],
    );
    return rows[0] ?? null;
  }

  /** The next number in the friend's sequence; a discarded stack's is reused. */
  async nextStackNo(client: Queryable, friendId: number): Promise<number> {
    const { rows } = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(stack_no), 0)::int + 1 AS next FROM record_care_sessions
       WHERE friend_id = $1 AND status <> 'discarded'`,
      [friendId],
    );
    return rows[0].next;
  }

  /** An open stack, or — with `stack_no` null — an ad-hoc session already logged. */
  async insertSession(
    client: Queryable,
    input: { friend_id: number; stack_no: number | null; source: RecordCareSource },
  ): Promise<RecordCareSessionRow> {
    const { rows } = await client.query<RecordCareSessionRow>(
      `
      INSERT INTO record_care_sessions (friend_id, stack_no, source, status, logged_at)
      VALUES ($1, $2::int, $3,
              CASE WHEN $2::int IS NULL THEN 'logged' ELSE 'open' END,
              CASE WHEN $2::int IS NULL THEN NOW() END)
      RETURNING *
      `,
      [input.friend_id, input.stack_no, input.source],
    );
    return rows[0];
  }

  async insertItems(
    client: Queryable,
    sessionId: number,
    items: RecordCareSessionItemInput[],
  ): Promise<void> {
    await client.query(
      `
      INSERT INTO record_care_session_items (session_id, position, release_id, copy_id)
      SELECT $1, item.position - 1, item.release_id, item.copy_id
      FROM unnest($2::text[], $3::int[]) WITH ORDINALITY AS item(release_id, copy_id, position)
      `,
      [sessionId, items.map((item) => item.release_id), items.map((item) => item.copy_id)],
    );
  }

  /** The friend's session; null if not theirs. Locked when `forUpdate`. */
  async findSession(
    client: Queryable | null,
    sessionId: number,
    friendId: number,
    options: { forUpdate?: boolean } = {},
  ): Promise<RecordCareSessionRow | null> {
    const { rows } = await (client ?? pool).query<RecordCareSessionRow>(
      `SELECT * FROM record_care_sessions WHERE id = $1 AND friend_id = $2
       ${options.forUpdate ? "FOR UPDATE" : ""}`,
      [sessionId, friendId],
    );
    return rows[0] ?? null;
  }

  /** The friend's stacks, newest first. Ad-hoc sessions are not stacks. */
  async listStacks(filters: {
    friend_id: number;
    status?: RecordCareSessionStatus;
    limit: number;
    offset: number;
  }): Promise<RecordCareSessionRow[]> {
    const params: Array<number | string> = [filters.friend_id, filters.limit, filters.offset];
    let statusClause = "";
    if (filters.status) {
      params.push(filters.status);
      statusClause = "AND status = $4";
    }
    const { rows } = await dbQuery<RecordCareSessionRow>(
      `
      SELECT * FROM record_care_sessions
      WHERE friend_id = $1 AND stack_no IS NOT NULL ${statusClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3
      `,
      params,
    );
    return rows;
  }

  /**
   * The sessions' copies in stack order, with the album and the copy's care
   * state. An item still pointing at an implicit default copy shows the
   * default copy if logging has since made it real.
   */
  async listItems(
    client: Queryable | null,
    friendId: number,
    sessionIds: number[],
  ): Promise<RecordCareStackItemRow[]> {
    if (sessionIds.length === 0) return [];
    const { rows } = await (client ?? pool).query<RecordCareStackItemRow>(
      `
      SELECT
        i.session_id,
        i.position,
        COALESCE(i.copy_id, d.id) AS copy_id,
        i.release_id,
        a.title AS album_title,
        a.artist AS album_artist,
        CASE WHEN a.release_id IS NULL THEN NULL ELSE ${coverUrlSql("a", true)} END
          AS album_thumbnail,
        COALESCE(c.inner_sleeve_type, d.inner_sleeve_type) AS inner_sleeve_type,
        COALESCE(c.last_cleaned_at, d.last_cleaned_at) AS last_cleaned_at
      FROM record_care_session_items i
      LEFT JOIN record_copies c ON c.id = i.copy_id
      LEFT JOIN record_copies d
        ON i.copy_id IS NULL
       AND d.friend_id = $1
       AND d.release_id = i.release_id
       AND d.is_default
       AND d.deleted_at IS NULL
      LEFT JOIN albums a ON a.friend_id = $1 AND a.release_id = i.release_id
      WHERE i.session_id = ANY($2::int[])
      ORDER BY i.session_id, i.position
      `,
      [friendId, sessionIds],
    );
    return rows;
  }

  /** Logged: stamped, un-voided, and credited to the source that logged it. */
  async markLogged(
    client: Queryable,
    sessionId: number,
    source: RecordCareSource,
  ): Promise<RecordCareSessionRow> {
    const { rows } = await client.query<RecordCareSessionRow>(
      `UPDATE record_care_sessions
       SET status = 'logged', logged_at = NOW(), voided_at = NULL, source = $2
       WHERE id = $1 RETURNING *`,
      [sessionId, source],
    );
    return rows[0];
  }

  /** Undone. A stack goes back to open; an ad-hoc session stays logged. */
  async markVoided(client: Queryable, sessionId: number): Promise<RecordCareSessionRow> {
    const { rows } = await client.query<RecordCareSessionRow>(
      `UPDATE record_care_sessions SET
         voided_at = NOW(),
         status = CASE WHEN stack_no IS NULL THEN status ELSE 'open' END,
         logged_at = CASE WHEN stack_no IS NULL THEN logged_at END
       WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return rows[0];
  }

  async markDiscarded(client: Queryable, sessionId: number): Promise<RecordCareSessionRow> {
    const { rows } = await client.query<RecordCareSessionRow>(
      `UPDATE record_care_sessions SET status = 'discarded' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return rows[0];
  }

  /**
   * The care log, newest first: one entry per session with actions, and one
   * per action logged outside a session. A live session counts its live
   * actions; an undone one shows what it voided.
   */
  async careLog(filters: {
    friend_id: number;
    limit: number;
    offset: number;
  }): Promise<{ items: RecordCareLogRow[]; total: number }> {
    const entriesSql = `
      SELECT
        'session' AS kind,
        s.id AS session_id,
        NULL::int AS action_id,
        s.stack_no,
        s.source,
        array_agg(DISTINCT ra.action_type) AS action_types,
        COUNT(DISTINCT ra.copy_id)::int AS record_count,
        MAX(ra.details->>'method') AS method,
        MAX(ra.sleeve_type) AS sleeve_type,
        MAX(ra.notes) AS notes,
        MAX(ra.occurred_at) AS occurred_at,
        s.voided_at IS NOT NULL AS voided,
        array_agg(DISTINCT ra.copy_id) AS copy_ids,
        s.id AS tiebreak
      FROM record_care_sessions s
      JOIN record_actions ra
        ON ra.session_id = s.id
       AND (ra.voided_at IS NULL OR s.voided_at IS NOT NULL)
      WHERE s.friend_id = $1
      GROUP BY s.id
      UNION ALL
      SELECT
        'action', NULL, ra.id, NULL, ra.source,
        ARRAY[ra.action_type]::varchar[], 1, ra.details->>'method', ra.sleeve_type, ra.notes,
        ra.occurred_at, ra.voided_at IS NOT NULL, ARRAY[ra.copy_id], ra.id
      FROM record_actions ra
      WHERE ra.friend_id = $1 AND ra.session_id IS NULL
    `;

    const [page, count] = await Promise.all([
      dbQuery<RecordCareLogRow>(
        `
        WITH entries AS (${entriesSql})
        SELECT
          e.kind, e.session_id, e.action_id, e.stack_no, e.source, e.action_types,
          e.record_count, e.method, e.sleeve_type, e.notes, e.occurred_at, e.voided,
          ARRAY(
            SELECT cover FROM (
              SELECT ${coverUrlSql("a", true)} AS cover, a.artist, a.title
              FROM record_copies c
              JOIN albums a ON a.friend_id = c.friend_id AND a.release_id = c.release_id
              WHERE c.id = ANY(e.copy_ids)
            ) covers
            WHERE cover IS NOT NULL
            ORDER BY artist, title
            LIMIT 10
          ) AS thumbnails
        FROM entries e
        ORDER BY e.occurred_at DESC, e.kind DESC, e.tiebreak DESC
        LIMIT $2 OFFSET $3
        `,
        [filters.friend_id, filters.limit, filters.offset],
      ),
      dbQuery<{ total: number }>(
        `WITH entries AS (${entriesSql}) SELECT COUNT(*)::int AS total FROM entries`,
        [filters.friend_id],
      ),
    ]);
    return { items: page.rows, total: count.rows[0]?.total ?? 0 };
  }
}

export const recordCareSessionRepository = new RecordCareSessionRepository();
