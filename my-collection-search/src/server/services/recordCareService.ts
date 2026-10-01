import { withDbTransaction } from "@/lib/serverDb";
import {
  DEFAULT_TARGET_SLEEVE,
  SLEEVE_TYPES,
  defaultOverdueDays,
  type RecordActionType,
  type RecordCareStatus,
  type SleeveType,
} from "@/lib/recordCare";
import { albumRepository } from "@/server/repositories/albumRepository";
import {
  recordActionRepository,
  type RecordActionDetails,
  type RecordActionRow,
} from "@/server/repositories/recordActionRepository";
import {
  recordCopyRepository,
  type RecordCareCounts,
  type RecordCareRow,
  type RecordCopyRow,
} from "@/server/repositories/recordCopyRepository";

// Thrown messages, mapped to HTTP statuses by recordCareErrorStatus.
export const ALBUM_NOT_FOUND = "Album not found";
export const RECORD_COPY_NOT_FOUND = "Record copy not found";
export const DEFAULT_COPY_HAS_SIBLINGS =
  "The default copy cannot be deleted while the release has other copies";

export type RecordCopy = Omit<
  RecordCopyRow,
  "last_cleaned_at" | "deleted_at" | "created_at" | "updated_at"
> & {
  last_cleaned_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordAction = Omit<RecordActionRow, "occurred_at" | "voided_at" | "created_at"> & {
  occurred_at: string;
  voided_at: string | null;
  created_at: string;
};

export type RecordCareItem = Omit<RecordCareRow, "last_cleaned_at"> & {
  last_cleaned_at: string | null;
};

export type LogRecordActionInput = {
  friend_id: number;
  action_type: RecordActionType;
  occurred_at?: string | Date;
  notes?: string | null;
  sleeve_type?: SleeveType | null;
  details?: RecordActionDetails;
} & ({ copy_id: number; release_id?: never } | { copy_id?: never; release_id: string });

export type RecordCareSummary = RecordCareCounts & {
  by_sleeve_type: Record<SleeveType | "unknown", number>;
  overdue_days: number;
  needs_sleeve_type: SleeveType;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value == null ? null : toIso(value);
}

function normalizeCopy(row: RecordCopyRow): RecordCopy {
  return {
    ...row,
    last_cleaned_at: toIsoOrNull(row.last_cleaned_at),
    deleted_at: toIsoOrNull(row.deleted_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function normalizeAction(row: RecordActionRow): RecordAction {
  return {
    ...row,
    occurred_at: toIso(row.occurred_at),
    voided_at: toIsoOrNull(row.voided_at),
    created_at: toIso(row.created_at),
  };
}

function normalizeCareRow(row: RecordCareRow): RecordCareItem {
  return { ...row, last_cleaned_at: toIsoOrNull(row.last_cleaned_at) };
}

export class RecordCareService {
  async listCopies(friendId: number, releaseId?: string): Promise<RecordCopy[]> {
    const rows = await recordCopyRepository.listCopies(friendId, releaseId);
    return rows.map(normalizeCopy);
  }

  /** Add a copy of a release in the friend's collection; its first becomes the default. */
  async createCopy(input: {
    friend_id: number;
    release_id: string;
    label?: string | null;
    notes?: string | null;
  }): Promise<RecordCopy> {
    await this.assertAlbumExists(input.release_id, input.friend_id);
    const copy = await withDbTransaction((client) =>
      recordCopyRepository.createCopy(client, input)
    );
    return normalizeCopy(copy);
  }

  /** Null when the copy is not the friend's, or is deleted. */
  async updateCopy(
    copyId: number,
    friendId: number,
    input: { label?: string | null; notes?: string | null }
  ): Promise<RecordCopy | null> {
    const updated = await withDbTransaction(async (client) => {
      const existing = await recordCopyRepository.findCopyForUpdate(client, copyId, friendId);
      if (!existing) return null;
      return recordCopyRepository.updateCopy(client, copyId, input);
    });
    return updated ? normalizeCopy(updated) : null;
  }

  /**
   * Soft-delete a copy; its actions stay as history. The default copy goes
   * only once it is the release's last, so a release with copies always has a
   * default for release-level actions to land on. Null when not the friend's.
   */
  async deleteCopy(copyId: number, friendId: number): Promise<RecordCopy | null> {
    const deleted = await withDbTransaction(async (client) => {
      const existing = await recordCopyRepository.findCopyForUpdate(client, copyId, friendId);
      if (!existing) return null;
      if (existing.is_default && (await recordCopyRepository.countSiblings(client, existing)) > 0) {
        throw new Error(DEFAULT_COPY_HAS_SIBLINGS);
      }
      return recordCopyRepository.softDeleteCopy(client, copyId);
    });
    return deleted ? normalizeCopy(deleted) : null;
  }

  /** A copy's history, newest first. Null when the copy is not the friend's. */
  async listActions(filters: {
    copy_id: number;
    friend_id: number;
    action_type?: RecordActionType;
    include_voided?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<RecordAction[] | null> {
    const copy = await recordCopyRepository.findCopy(filters.copy_id, filters.friend_id);
    if (!copy) return null;
    const rows = await recordActionRepository.listActions(filters);
    return rows.map(normalizeAction);
  }

  /**
   * Log an action against a copy, or against a release — which lands on its
   * default copy, created on the spot if it has none. The copy is locked
   * before the insert and its cached care state rebuilt in the same
   * transaction.
   */
  async logAction(
    input: LogRecordActionInput
  ): Promise<{ action: RecordAction; copy: RecordCopy }> {
    if (input.release_id !== undefined) {
      await this.assertAlbumExists(input.release_id, input.friend_id);
    }

    const result = await withDbTransaction(async (client) => {
      const copyId =
        input.copy_id !== undefined
          ? input.copy_id
          : (await recordCopyRepository.ensureDefaultCopy(client, input.friend_id, input.release_id))
              .id;
      const locked = await recordCopyRepository.findCopyForUpdate(
        client,
        copyId,
        input.friend_id
      );
      if (!locked) throw new Error(RECORD_COPY_NOT_FOUND);

      const action = await recordActionRepository.insertAction(client, {
        copy_id: locked.id,
        friend_id: input.friend_id,
        action_type: input.action_type,
        occurred_at: input.occurred_at ?? new Date(),
        notes: input.notes,
        sleeve_type: input.action_type === "sleeved" ? input.sleeve_type : null,
        details: input.details,
      });
      const copy = await recordCopyRepository.refreshCareState(client, locked.id);
      return { action, copy };
    });

    return { action: normalizeAction(result.action), copy: normalizeCopy(result.copy) };
  }

  /**
   * Void an action: it stays in the history, marked, and stops counting
   * toward the copy's care state. Null when the action is not the friend's.
   */
  async voidAction(
    actionId: number,
    friendId: number
  ): Promise<{ action: RecordAction; copy: RecordCopy } | null> {
    const result = await withDbTransaction(async (client) => {
      const existing = await recordActionRepository.findAction(client, actionId, friendId);
      if (!existing) return null;
      // Lock the copy before touching its actions, as logAction does.
      await recordCopyRepository.findCopyForUpdate(client, existing.copy_id, friendId, {
        includeDeleted: true,
      });
      const action = await recordActionRepository.voidAction(client, actionId);
      const copy = await recordCopyRepository.refreshCareState(client, existing.copy_id);
      return { action, copy };
    });

    return result
      ? { action: normalizeAction(result.action), copy: normalizeCopy(result.copy) }
      : null;
  }

  async listCare(filters: {
    friend_id: number;
    status?: RecordCareStatus;
    overdue_days?: number;
    needs_sleeve?: SleeveType;
    sleeve_type?: SleeveType | "unknown";
    limit?: number;
    offset?: number;
  }): Promise<{
    items: RecordCareItem[];
    total: number;
    overdue_days: number;
    needs_sleeve_type: SleeveType;
  }> {
    const overdueDays = filters.overdue_days ?? defaultOverdueDays();
    const needsSleeve = filters.needs_sleeve ?? DEFAULT_TARGET_SLEEVE;
    const { items, total } = await recordCopyRepository.listCare({
      ...filters,
      overdue_days: overdueDays,
      needs_sleeve: needsSleeve,
    });
    return {
      items: items.map(normalizeCareRow),
      total,
      overdue_days: overdueDays,
      needs_sleeve_type: needsSleeve,
    };
  }

  async careSummary(
    friendId: number,
    options: { overdue_days?: number; needs_sleeve?: SleeveType } = {}
  ): Promise<RecordCareSummary> {
    const overdueDays = options.overdue_days ?? defaultOverdueDays();
    const needsSleeve = options.needs_sleeve ?? DEFAULT_TARGET_SLEEVE;
    const [counts, bySleeve] = await Promise.all([
      recordCopyRepository.careCounts(friendId, overdueDays, needsSleeve),
      recordCopyRepository.countBySleeveType(friendId),
    ]);

    const bySleeveType = Object.fromEntries(
      [...SLEEVE_TYPES, "unknown" as const].map((type) => [type, 0])
    ) as Record<SleeveType | "unknown", number>;
    for (const row of bySleeve) bySleeveType[row.sleeve_type ?? "unknown"] = row.count;

    return {
      ...counts,
      by_sleeve_type: bySleeveType,
      overdue_days: overdueDays,
      needs_sleeve_type: needsSleeve,
    };
  }

  private async assertAlbumExists(releaseId: string, friendId: number): Promise<void> {
    const album = await albumRepository.getAlbumByReleaseAndFriend(releaseId, friendId);
    if (!album) throw new Error(ALBUM_NOT_FOUND);
  }
}

export const recordCareService = new RecordCareService();
