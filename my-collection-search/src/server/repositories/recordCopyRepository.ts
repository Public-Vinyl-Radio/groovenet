import { dbQuery } from "@/lib/serverDb";
import type { RecordCareStatus, SleeveType } from "@/lib/recordCare";
import type { PoolClient } from "pg";

export type Queryable = Pick<PoolClient, "query">;

export type RecordCopyRow = {
  id: number;
  friend_id: number;
  release_id: string;
  is_default: boolean;
  label: string | null;
  notes: string | null;
  inner_sleeve_type: SleeveType | null;
  last_cleaned_at: Date | string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CreateRecordCopyInput = {
  friend_id: number;
  release_id: string;
  label?: string | null;
  notes?: string | null;
};

export type UpdateRecordCopyInput = {
  label?: string | null;
  notes?: string | null;
};

/**
 * One row of the care views: a live copy, or — for an album with no copy rows
 * yet — its implicit default copy, with `copy_id` null.
 */
export type RecordCareRow = {
  friend_id: number;
  release_id: string;
  album_title: string;
  album_artist: string;
  album_thumbnail: string | null;
  copy_id: number | null;
  is_default: boolean;
  label: string | null;
  inner_sleeve_type: SleeveType | null;
  last_cleaned_at: Date | string | null;
};

export type ListRecordCareFilters = {
  friend_id: number;
  status?: RecordCareStatus;
  overdue_days: number;
  needs_sleeve: SleeveType;
  /** A sleeve, or "unknown" for copies with none logged. */
  sleeve_type?: SleeveType | "unknown";
  limit?: number;
  offset?: number;
};

export type RecordCareCounts = {
  total: number;
  never_cleaned: number;
  overdue: number;
  needs_sleeve: number;
};

// Every album the friend owns, joined to its live copies. An album with none
// still yields one row, all copy columns null: its implicit default copy,
// which has never been cleaned or sleeved. Without it "never cleaned" would
// only see records that had already been touched. Albums gone from the
// collection drop out here; their copies and history stay.
const CARE_SCOPE_SQL = `
  SELECT
    a.friend_id,
    a.release_id,
    a.title AS album_title,
    a.artist AS album_artist,
    a.album_thumbnail,
    c.id AS copy_id,
    COALESCE(c.is_default, true) AS is_default,
    c.label,
    c.inner_sleeve_type,
    c.last_cleaned_at
  FROM albums a
  LEFT JOIN record_copies c
    ON c.friend_id = a.friend_id
   AND c.release_id = a.release_id
   AND c.deleted_at IS NULL
  WHERE a.friend_id = $1
`;

export class RecordCopyRepository {
  async listCopies(friendId: number, releaseId?: string): Promise<RecordCopyRow[]> {
    const params: Array<number | string> = [friendId];
    let releaseClause = "";
    if (releaseId) {
      params.push(releaseId);
      releaseClause = "AND release_id = $2";
    }
    const { rows } = await dbQuery<RecordCopyRow>(
      `
      SELECT * FROM record_copies
      WHERE friend_id = $1 AND deleted_at IS NULL ${releaseClause}
      ORDER BY release_id ASC, is_default DESC, id ASC
      `,
      params
    );
    return rows;
  }

  /** The friend's copy, deleted or not; null if not theirs. */
  async findCopy(copyId: number, friendId: number): Promise<RecordCopyRow | null> {
    const { rows } = await dbQuery<RecordCopyRow>(
      "SELECT * FROM record_copies WHERE id = $1 AND friend_id = $2",
      [copyId, friendId]
    );
    return rows[0] ?? null;
  }

  /**
   * The friend's copy, locked for the rest of the transaction; null if not
   * theirs. Only a live one unless `includeDeleted` — voiding an action on a
   * deleted copy still has to lock it.
   */
  async findCopyForUpdate(
    client: Queryable,
    copyId: number,
    friendId: number,
    options: { includeDeleted?: boolean } = {}
  ): Promise<RecordCopyRow | null> {
    const liveClause = options.includeDeleted ? "" : "AND deleted_at IS NULL";
    const { rows } = await client.query<RecordCopyRow>(
      `SELECT * FROM record_copies
       WHERE id = $1 AND friend_id = $2 ${liveClause}
       FOR UPDATE`,
      [copyId, friendId]
    );
    return rows[0] ?? null;
  }

  /**
   * The release's default copy, created if it has none yet. Two transactions
   * doing this at once meet on the partial unique index: the second insert
   * waits for the first to commit, does nothing, and the select that follows
   * — a new statement, so a new snapshot — finds the committed row.
   */
  async ensureDefaultCopy(
    client: Queryable,
    friendId: number,
    releaseId: string
  ): Promise<RecordCopyRow> {
    const inserted = await client.query<RecordCopyRow>(
      `
      INSERT INTO record_copies (friend_id, release_id, is_default)
      VALUES ($1, $2, true)
      ON CONFLICT (friend_id, release_id) WHERE is_default AND deleted_at IS NULL
      DO NOTHING
      RETURNING *
      `,
      [friendId, releaseId]
    );
    if (inserted.rows[0]) return inserted.rows[0];

    const { rows } = await client.query<RecordCopyRow>(
      `SELECT * FROM record_copies
       WHERE friend_id = $1 AND release_id = $2 AND is_default AND deleted_at IS NULL`,
      [friendId, releaseId]
    );
    return rows[0];
  }

  /**
   * Add an extra copy. A release's implicit copy is its default, so adding one
   * means one more physical copy: the caller makes the default real first
   * (`ensureDefaultCopy`), in the same transaction.
   */
  async insertExtraCopy(client: Queryable, input: CreateRecordCopyInput): Promise<RecordCopyRow> {
    const { rows } = await client.query<RecordCopyRow>(
      `
      INSERT INTO record_copies (friend_id, release_id, label, notes, is_default)
      VALUES ($1, $2, $3, $4, false)
      RETURNING *
      `,
      [input.friend_id, input.release_id, input.label ?? null, input.notes ?? null]
    );
    return rows[0];
  }

  async updateCopy(
    client: Queryable,
    copyId: number,
    input: UpdateRecordCopyInput
  ): Promise<RecordCopyRow> {
    const assignments = ["updated_at = NOW()"];
    const params: Array<number | string | null> = [copyId];
    const set = (column: string, value: string | null) => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (input.label !== undefined) set("label", input.label);
    if (input.notes !== undefined) set("notes", input.notes);

    const { rows } = await client.query<RecordCopyRow>(
      `UPDATE record_copies SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
      params
    );
    return rows[0];
  }

  /** Other live copies of the same release. */
  async countSiblings(client: Queryable, copy: RecordCopyRow): Promise<number> {
    const { rows } = await client.query<{ count: number }>(
      `
      SELECT COUNT(*)::int AS count FROM record_copies
      WHERE friend_id = $1 AND release_id = $2 AND id <> $3 AND deleted_at IS NULL
      `,
      [copy.friend_id, copy.release_id, copy.id]
    );
    return rows[0]?.count ?? 0;
  }

  async softDeleteCopy(client: Queryable, copyId: number): Promise<RecordCopyRow> {
    const { rows } = await client.query<RecordCopyRow>(
      `UPDATE record_copies SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [copyId]
    );
    return rows[0];
  }

  /**
   * Rebuild the cached care state from the copy's live actions. A full
   * recompute rather than an increment, so a backdated action or a voided one
   * leaves it right. The caller must hold the copy's row lock from before its
   * action write: under READ COMMITTED that is what lets this statement see an
   * action a concurrent transaction committed first.
   */
  async refreshCareState(client: Queryable, copyId: number): Promise<RecordCopyRow> {
    const { rows } = await client.query<RecordCopyRow>(
      `
      UPDATE record_copies c SET
        last_cleaned_at = (
          SELECT MAX(ra.occurred_at) FROM record_actions ra
          WHERE ra.copy_id = c.id AND ra.action_type = 'cleaned' AND ra.voided_at IS NULL
        ),
        inner_sleeve_type = (
          SELECT ra.sleeve_type FROM record_actions ra
          WHERE ra.copy_id = c.id AND ra.action_type = 'sleeved' AND ra.voided_at IS NULL
          ORDER BY ra.occurred_at DESC, ra.id DESC
          LIMIT 1
        ),
        updated_at = NOW()
      WHERE c.id = $1
      RETURNING *
      `,
      [copyId]
    );
    return rows[0];
  }

  async listCare(
    filters: ListRecordCareFilters
  ): Promise<{ items: RecordCareRow[]; total: number }> {
    const params: Array<number | string> = [filters.friend_id];
    const where: string[] = [];

    if (filters.status === "never_cleaned") {
      where.push("last_cleaned_at IS NULL");
    } else if (filters.status === "overdue") {
      params.push(filters.overdue_days);
      where.push(`last_cleaned_at < NOW() - make_interval(days => $${params.length}::int)`);
    } else if (filters.status === "needs_sleeve") {
      params.push(filters.needs_sleeve);
      where.push(`inner_sleeve_type IS DISTINCT FROM $${params.length}::varchar`);
    }
    if (filters.sleeve_type === "unknown") {
      where.push("inner_sleeve_type IS NULL");
    } else if (filters.sleeve_type) {
      params.push(filters.sleeve_type);
      where.push(`inner_sleeve_type = $${params.length}::varchar`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const filterParams = [...params];

    params.push(filters.limit ?? 50);
    const limitRef = `$${params.length}`;
    params.push(filters.offset ?? 0);
    const offsetRef = `$${params.length}`;

    const [page, count] = await Promise.all([
      dbQuery<RecordCareRow>(
        `
        WITH scope AS (${CARE_SCOPE_SQL})
        SELECT * FROM scope
        ${whereSql}
        ORDER BY last_cleaned_at ASC NULLS FIRST, album_artist ASC, album_title ASC,
                 release_id ASC, copy_id ASC NULLS FIRST
        LIMIT ${limitRef} OFFSET ${offsetRef}
        `,
        params
      ),
      dbQuery<{ total: number }>(
        `WITH scope AS (${CARE_SCOPE_SQL}) SELECT COUNT(*)::int AS total FROM scope ${whereSql}`,
        filterParams
      ),
    ]);

    return { items: page.rows, total: count.rows[0]?.total ?? 0 };
  }

  async careCounts(
    friendId: number,
    overdueDays: number,
    needsSleeve: SleeveType
  ): Promise<RecordCareCounts> {
    const { rows } = await dbQuery<RecordCareCounts>(
      `
      WITH scope AS (${CARE_SCOPE_SQL})
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE last_cleaned_at IS NULL)::int AS never_cleaned,
        COUNT(*) FILTER (
          WHERE last_cleaned_at < NOW() - make_interval(days => $2::int)
        )::int AS overdue,
        COUNT(*) FILTER (WHERE inner_sleeve_type IS DISTINCT FROM $3::varchar)::int AS needs_sleeve
      FROM scope
      `,
      [friendId, overdueDays, needsSleeve]
    );
    return rows[0];
  }

  /** Copies per sleeve; a null sleeve_type is a copy with none logged. */
  async countBySleeveType(
    friendId: number
  ): Promise<Array<{ sleeve_type: SleeveType | null; count: number }>> {
    const { rows } = await dbQuery<{ sleeve_type: SleeveType | null; count: number }>(
      `
      WITH scope AS (${CARE_SCOPE_SQL})
      SELECT inner_sleeve_type AS sleeve_type, COUNT(*)::int AS count
      FROM scope
      GROUP BY inner_sleeve_type
      `,
      [friendId]
    );
    return rows;
  }
}

export const recordCopyRepository = new RecordCopyRepository();
