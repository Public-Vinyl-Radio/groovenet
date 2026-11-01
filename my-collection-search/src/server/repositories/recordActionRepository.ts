import { dbQuery } from "@/lib/serverDb";
import type { RecordAction, RecordActionDetails, RecordCareSource } from "@groovenet/contracts";
import type { RecordActionType, SleeveType } from "@/lib/recordCare";
import type { Queryable } from "./recordCopyRepository";

/** A `RecordAction` before its timestamps are normalised: pg returns Dates. */
export type RecordActionRow = Omit<RecordAction, "occurred_at" | "voided_at" | "created_at"> & {
  occurred_at: Date | string;
  voided_at: Date | string | null;
  created_at: Date | string;
};

export type CreateRecordActionInput = {
  copy_id: number;
  friend_id: number;
  action_type: RecordActionType;
  occurred_at: string | Date;
  notes?: string | null;
  sleeve_type?: SleeveType | null;
  details?: RecordActionDetails;
  session_id?: number | null;
  source?: RecordCareSource;
};

export type ListRecordActionsFilters = {
  copy_id: number;
  friend_id: number;
  action_type?: RecordActionType;
  include_voided?: boolean;
  limit?: number;
  offset?: number;
};

export class RecordActionRepository {
  async insertAction(client: Queryable, input: CreateRecordActionInput): Promise<RecordActionRow> {
    const { rows } = await client.query<RecordActionRow>(
      `
      INSERT INTO record_actions (
        copy_id, friend_id, action_type, occurred_at, notes, sleeve_type, details,
        session_id, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        input.copy_id,
        input.friend_id,
        input.action_type,
        input.occurred_at,
        input.notes ?? null,
        input.sleeve_type ?? null,
        JSON.stringify(input.details ?? {}),
        input.session_id ?? null,
        input.source ?? "api",
      ],
    );
    return rows[0];
  }

  async listActions(filters: ListRecordActionsFilters): Promise<RecordActionRow[]> {
    const where = ["copy_id = $1", "friend_id = $2"];
    const params: Array<number | string> = [filters.copy_id, filters.friend_id];

    if (filters.action_type) {
      params.push(filters.action_type);
      where.push(`action_type = $${params.length}`);
    }
    if (!filters.include_voided) where.push("voided_at IS NULL");

    params.push(filters.limit ?? 50);
    const limitRef = `$${params.length}`;
    params.push(filters.offset ?? 0);
    const offsetRef = `$${params.length}`;

    const { rows } = await dbQuery<RecordActionRow>(
      `
      SELECT * FROM record_actions
      WHERE ${where.join(" AND ")}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limitRef} OFFSET ${offsetRef}
      `,
      params,
    );
    return rows;
  }

  /** The friend's action, whether voided or not; null if not theirs. */
  async findAction(
    client: Queryable,
    actionId: number,
    friendId: number,
  ): Promise<RecordActionRow | null> {
    const { rows } = await client.query<RecordActionRow>(
      "SELECT * FROM record_actions WHERE id = $1 AND friend_id = $2",
      [actionId, friendId],
    );
    return rows[0] ?? null;
  }

  /** A session's live actions, oldest first: what undoing it voids. */
  async listLiveSessionActions(client: Queryable, sessionId: number): Promise<RecordActionRow[]> {
    const { rows } = await client.query<RecordActionRow>(
      `SELECT * FROM record_actions
       WHERE session_id = $1 AND voided_at IS NULL
       ORDER BY id ASC`,
      [sessionId],
    );
    return rows;
  }

  /** Void an action, keeping it as history. Voiding twice keeps the first time. */
  async voidAction(client: Queryable, actionId: number): Promise<RecordActionRow> {
    const { rows } = await client.query<RecordActionRow>(
      `UPDATE record_actions SET voided_at = COALESCE(voided_at, NOW())
       WHERE id = $1 RETURNING *`,
      [actionId],
    );
    return rows[0];
  }
}

export const recordActionRepository = new RecordActionRepository();
