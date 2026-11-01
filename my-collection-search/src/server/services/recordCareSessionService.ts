import {
  RECORD_ACTION_TYPES,
  RECORD_CARE_STACK_DEFAULT_SIZE,
  sessionActionFor,
  type RecordAction,
  type RecordActionDetails,
  type RecordActionType,
  type RecordCareCopyRef,
  type RecordCareLogEntry,
  type RecordCareSession,
  type RecordCareSessionStatus,
  type RecordCareSource,
  type RecordCopy,
  type SleeveType,
} from "@groovenet/contracts";
import { withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import {
  recordActionRepository,
  type RecordActionRow,
} from "@/server/repositories/recordActionRepository";
import {
  recordCareSessionRepository,
  type RecordCareSessionItemInput,
  type RecordCareSessionRow,
  type RecordCareStackItemRow,
} from "@/server/repositories/recordCareSessionRepository";
import {
  recordCopyRepository,
  type Queryable,
  type RecordCopyRow,
} from "@/server/repositories/recordCopyRepository";
import {
  ALBUM_NOT_FOUND,
  RECORD_COPY_NOT_FOUND,
  normalizeAction,
  normalizeCopy,
  recordCareService,
} from "@/server/services/recordCareService";

// Thrown messages, mapped to HTTP statuses by recordCareSessionErrorStatus.
export const RECORD_CARE_SESSION_NOT_FOUND = "Care session not found";
export const STACK_NOT_OPEN = "The stack is not open";
export const SESSION_NOT_LOGGED = "The session has no logged care to undo";
export const ANOTHER_STACK_OPEN = "Another stack is open; log or clear it first";
export const NOTHING_TO_PULL = "Every record in the queue has been cleaned";

export type PullStackInput = {
  friend_id: number;
  size?: number;
  copies?: RecordCareCopyRef[];
  source?: RecordCareSource;
};

export type LogSessionInput = {
  friend_id: number;
  stack_id?: number;
  copies?: RecordCareCopyRef[];
  action_types: RecordActionType[];
  occurred_at?: string;
  notes?: string | null;
  sleeve_type?: SleeveType;
  details?: RecordActionDetails;
  source?: RecordCareSource;
};

export type SessionMutationResult = {
  session: RecordCareSession;
  actions: RecordAction[];
  copies: RecordCopy[];
};

function toIsoOrNull(value: Date | string | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function normalizeSession(
  row: RecordCareSessionRow,
  items: RecordCareStackItemRow[],
): RecordCareSession {
  return {
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    logged_at: toIsoOrNull(row.logged_at),
    voided_at: toIsoOrNull(row.voided_at),
    items: items
      .filter((item) => item.session_id === row.id)
      .map(({ session_id: _sessionId, ...item }) => ({
        ...item,
        last_cleaned_at: toIsoOrNull(item.last_cleaned_at),
      })),
  };
}

/** Copies refs name the same copy twice only by mistake; keep the first. */
function dedupeItems(items: RecordCareSessionItemInput[]): RecordCareSessionItemInput[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.copy_id !== null ? `c${item.copy_id}` : `r${item.release_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The copies a stack pull takes when none are named.
 *
 * TODO(#942): the chores queue defines the real order (spun recently, then new
 * arrivals, then the A–Z backlog) and excludes copies in an open stack. Until
 * it lands this is the backlog alone: never-cleaned copies, artist then title.
 */
export async function defaultStackCandidates(
  friendId: number,
  size: number,
): Promise<RecordCareSessionItemInput[]> {
  const { items } = await recordCareService.listCare({
    friend_id: friendId,
    status: "never_cleaned",
    limit: size,
    offset: 0,
  });
  return items.map((item) => ({ release_id: item.release_id, copy_id: item.copy_id }));
}

export class RecordCareSessionService {
  /**
   * Pull the next stack. With an open stack already, return that one
   * (`created: false`) — a second tap or a CLI retry never makes two.
   */
  async pullStack(input: PullStackInput): Promise<{ stack: RecordCareSession; created: boolean }> {
    const explicit = input.copies ? await this.resolveRefs(input.friend_id, input.copies) : null;

    return withDbTransaction(async (client) => {
      await recordCareSessionRepository.lockFriendStacks(client, input.friend_id);
      const open = await recordCareSessionRepository.findOpenStack(client, input.friend_id);
      if (open) return { stack: await this.loadSession(client, open), created: false };

      const items =
        explicit ??
        (await defaultStackCandidates(
          input.friend_id,
          input.size ?? RECORD_CARE_STACK_DEFAULT_SIZE,
        ));
      if (items.length === 0) throw new Error(NOTHING_TO_PULL);

      const stackNo = await recordCareSessionRepository.nextStackNo(client, input.friend_id);
      const session = await recordCareSessionRepository.insertSession(client, {
        friend_id: input.friend_id,
        stack_no: stackNo,
        source: input.source ?? "api",
      });
      await recordCareSessionRepository.insertItems(client, session.id, items);
      return { stack: await this.loadSession(client, session), created: true };
    });
  }

  async getStack(sessionId: number, friendId: number): Promise<RecordCareSession | null> {
    const row = await recordCareSessionRepository.findSession(null, sessionId, friendId);
    return row ? this.loadSession(null, row) : null;
  }

  async listStacks(filters: {
    friend_id: number;
    status?: RecordCareSessionStatus;
    limit: number;
    offset: number;
  }): Promise<RecordCareSession[]> {
    const rows = await recordCareSessionRepository.listStacks(filters);
    const items = await recordCareSessionRepository.listItems(
      null,
      filters.friend_id,
      rows.map((row) => row.id),
    );
    return rows.map((row) => normalizeSession(row, items));
  }

  /** Clear an open stack. Clearing one already cleared is a no-op. */
  async discardStack(sessionId: number, friendId: number): Promise<RecordCareSession | null> {
    return withDbTransaction(async (client) => {
      const row = await recordCareSessionRepository.findSession(client, sessionId, friendId, {
        forUpdate: true,
      });
      if (!row) return null;
      if (row.status === "discarded") return this.loadSession(client, row);
      if (row.status !== "open") throw new Error(STACK_NOT_OPEN);
      return this.loadSession(
        client,
        await recordCareSessionRepository.markDiscarded(client, row.id),
      );
    });
  }

  /**
   * Batch log: one action per copy per type, all under one session, in one
   * transaction — a failure on any copy writes nothing. Each action goes
   * through the single-action write, so the cached care state is rebuilt
   * exactly as it is for one action.
   */
  async logSession(input: LogSessionInput): Promise<SessionMutationResult> {
    const source = input.source ?? "api";
    const adHocItems =
      input.copies !== undefined ? await this.resolveRefs(input.friend_id, input.copies) : null;

    const result = await withDbTransaction(async (client) => {
      let session: RecordCareSessionRow;
      let items: RecordCareSessionItemInput[];
      if (adHocItems) {
        session = await recordCareSessionRepository.insertSession(client, {
          friend_id: input.friend_id,
          stack_no: null,
          source,
        });
        items = adHocItems;
      } else {
        const stack = await recordCareSessionRepository.findSession(
          client,
          input.stack_id!,
          input.friend_id,
          { forUpdate: true },
        );
        if (!stack) throw new Error(RECORD_CARE_SESSION_NOT_FOUND);
        if (stack.status !== "open") throw new Error(STACK_NOT_OPEN);
        session = stack;
        items = (await recordCareSessionRepository.listItems(client, input.friend_id, [stack.id]))
          // A stack's implicit default copy is made real below.
          .map((item) => ({ release_id: item.release_id, copy_id: item.copy_id }));
        await this.assertAlbumsExist(input.friend_id, items);
      }

      // A copy ref and a release ref can name the same default copy.
      const resolved = await this.materialise(client, input.friend_id, items);
      const releaseOf = new Map(resolved.map((id, index) => [id, items[index].release_id]));
      const copyIds = [...releaseOf.keys()];
      if (adHocItems) {
        await recordCareSessionRepository.insertItems(
          client,
          session.id,
          copyIds.map((copyId) => ({ release_id: releaseOf.get(copyId)!, copy_id: copyId })),
        );
      }

      // Lock every copy in id order first, so two batches over overlapping
      // copies queue rather than deadlock.
      for (const copyId of [...new Set(copyIds)].sort((a, b) => a - b)) {
        const locked = await recordCopyRepository.findCopyForUpdate(
          client,
          copyId,
          input.friend_id,
        );
        if (!locked) throw new Error(RECORD_COPY_NOT_FOUND);
      }

      const occurredAt = input.occurred_at ?? new Date().toISOString();
      const types = RECORD_ACTION_TYPES.filter((type) => input.action_types.includes(type));
      const actions: RecordActionRow[] = [];
      const copies = new Map<number, RecordCopyRow>();
      for (const copyId of copyIds) {
        for (const type of types) {
          const written = await recordCareService.logActionInTransaction(client, {
            ...sessionActionFor({ ...input, occurred_at: occurredAt }, type),
            friend_id: input.friend_id,
            copy_id: copyId,
            session_id: session.id,
            source,
          });
          actions.push(written.action);
          copies.set(copyId, written.copy);
        }
      }

      const logged = await recordCareSessionRepository.markLogged(client, session.id, source);
      return {
        session: await this.loadSession(client, logged),
        actions,
        copies: [...copies.values()],
      };
    });

    return {
      session: result.session,
      actions: result.actions.map(normalizeAction),
      copies: result.copies.map(normalizeCopy),
    };
  }

  /**
   * Undo a log: void every live action in the session (they stay as history),
   * rebuild each copy's care state from what remains, and reopen the stack.
   * Null when the session is not the friend's.
   */
  async voidSession(sessionId: number, friendId: number): Promise<SessionMutationResult | null> {
    const result = await withDbTransaction(async (client) => {
      const row = await recordCareSessionRepository.findSession(client, sessionId, friendId, {
        forUpdate: true,
      });
      if (!row) return null;
      if (row.status !== "logged" || row.voided_at !== null) throw new Error(SESSION_NOT_LOGGED);

      if (row.stack_no !== null) {
        await recordCareSessionRepository.lockFriendStacks(client, friendId);
        if (await recordCareSessionRepository.findOpenStack(client, friendId)) {
          throw new Error(ANOTHER_STACK_OPEN);
        }
      }

      const live = await recordActionRepository.listLiveSessionActions(client, row.id);
      for (const copyId of [...new Set(live.map((action) => action.copy_id))].sort(
        (a, b) => a - b,
      )) {
        await recordCopyRepository.findCopyForUpdate(client, copyId, friendId, {
          includeDeleted: true,
        });
      }
      const actions: RecordActionRow[] = [];
      const copies = new Map<number, RecordCopyRow>();
      for (const action of live) {
        const voided = await recordCareService.voidActionInTransaction(client, action);
        actions.push(voided.action);
        copies.set(action.copy_id, voided.copy);
      }

      const voidedSession = await recordCareSessionRepository.markVoided(client, row.id);
      return {
        session: await this.loadSession(client, voidedSession),
        actions,
        copies: [...copies.values()],
      };
    });

    return result
      ? {
          session: result.session,
          actions: result.actions.map(normalizeAction),
          copies: result.copies.map(normalizeCopy),
        }
      : null;
  }

  /** The care log feed, newest first. */
  async listLog(filters: {
    friend_id: number;
    limit: number;
    offset: number;
  }): Promise<{ items: RecordCareLogEntry[]; total: number }> {
    const { items, total } = await recordCareSessionRepository.careLog(filters);
    return {
      items: items.map((item) => ({
        ...item,
        // Canonical order, not the aggregate's alphabetical one.
        action_types: RECORD_ACTION_TYPES.filter((type) => item.action_types.includes(type)),
        occurred_at: new Date(item.occurred_at).toISOString(),
      })),
      total,
    };
  }

  private async loadSession(
    client: Queryable | null,
    row: RecordCareSessionRow,
  ): Promise<RecordCareSession> {
    const items = await recordCareSessionRepository.listItems(client, row.friend_id, [row.id]);
    return normalizeSession(row, items);
  }

  /** Check each ref is the friend's: a live copy, or an album they own. */
  private async resolveRefs(
    friendId: number,
    refs: RecordCareCopyRef[],
  ): Promise<RecordCareSessionItemInput[]> {
    const items: RecordCareSessionItemInput[] = [];
    for (const ref of refs) {
      if (ref.copy_id !== undefined) {
        const copy = await recordCopyRepository.findCopy(ref.copy_id, friendId);
        if (!copy || copy.deleted_at !== null) throw new Error(RECORD_COPY_NOT_FOUND);
        items.push({ release_id: copy.release_id, copy_id: copy.id });
      } else {
        const releaseId = ref.release_id!;
        await this.assertAlbumsExist(friendId, [{ release_id: releaseId, copy_id: null }]);
        items.push({ release_id: releaseId, copy_id: null });
      }
    }
    return dedupeItems(items);
  }

  /** An implicit default copy can only be made real for an album still owned. */
  private async assertAlbumsExist(
    friendId: number,
    items: RecordCareSessionItemInput[],
  ): Promise<void> {
    for (const item of items) {
      if (item.copy_id !== null) continue;
      const album = await albumRepository.getAlbumByReleaseAndFriend(item.release_id, friendId);
      if (!album) throw new Error(ALBUM_NOT_FOUND);
    }
  }

  /** Every item's copy id, making implicit default copies real as logAction does. */
  private async materialise(
    client: Queryable,
    friendId: number,
    items: RecordCareSessionItemInput[],
  ): Promise<number[]> {
    const ids: number[] = [];
    for (const item of items) {
      ids.push(
        item.copy_id ??
          (await recordCopyRepository.ensureDefaultCopy(client, friendId, item.release_id)).id,
      );
    }
    return ids;
  }
}

export const recordCareSessionService = new RecordCareSessionService();
