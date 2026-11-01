import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withDbTransaction: vi.fn(),
  getAlbumByReleaseAndFriend: vi.fn(),
  findCopy: vi.fn(),
  findCopyForUpdate: vi.fn(),
  ensureDefaultCopy: vi.fn(),
  listLiveSessionActions: vi.fn(),
  lockFriendStacks: vi.fn(),
  findOpenStack: vi.fn(),
  nextStackNo: vi.fn(),
  insertSession: vi.fn(),
  insertItems: vi.fn(),
  findSession: vi.fn(),
  listStacks: vi.fn(),
  listItems: vi.fn(),
  markLogged: vi.fn(),
  markVoided: vi.fn(),
  markDiscarded: vi.fn(),
  careLog: vi.fn(),
  flattenedQueue: vi.fn(),
  logActionInTransaction: vi.fn(),
  voidActionInTransaction: vi.fn(),
}));

vi.mock("@/server/services/recordCareQueueService", () => ({
  flattenedRecordCareQueue: mocks.flattenedQueue,
}));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mocks.withDbTransaction }));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: { getAlbumByReleaseAndFriend: mocks.getAlbumByReleaseAndFriend },
}));
vi.mock("@/server/repositories/recordCopyRepository", () => ({
  recordCopyRepository: {
    findCopy: mocks.findCopy,
    findCopyForUpdate: mocks.findCopyForUpdate,
    ensureDefaultCopy: mocks.ensureDefaultCopy,
  },
}));
vi.mock("@/server/repositories/recordActionRepository", () => ({
  recordActionRepository: { listLiveSessionActions: mocks.listLiveSessionActions },
}));
vi.mock("@/server/repositories/recordCareSessionRepository", () => ({
  recordCareSessionRepository: {
    lockFriendStacks: mocks.lockFriendStacks,
    findOpenStack: mocks.findOpenStack,
    nextStackNo: mocks.nextStackNo,
    insertSession: mocks.insertSession,
    insertItems: mocks.insertItems,
    findSession: mocks.findSession,
    listStacks: mocks.listStacks,
    listItems: mocks.listItems,
    markLogged: mocks.markLogged,
    markVoided: mocks.markVoided,
    markDiscarded: mocks.markDiscarded,
    careLog: mocks.careLog,
  },
}));
vi.mock("@/server/services/recordCareService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/recordCareService")>()),
  recordCareService: {
    logActionInTransaction: mocks.logActionInTransaction,
    voidActionInTransaction: mocks.voidActionInTransaction,
  },
}));

import { ALBUM_NOT_FOUND, RECORD_COPY_NOT_FOUND } from "../recordCareService";
import {
  ANOTHER_STACK_OPEN,
  NOTHING_TO_PULL,
  RECORD_CARE_SESSION_NOT_FOUND,
  RecordCareSessionService,
  SESSION_NOT_LOGGED,
  STACK_NOT_OPEN,
  defaultStackCandidates,
} from "../recordCareSessionService";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const ISO = NOW.toISOString();

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    friend_id: 7,
    stack_no: 2,
    source: "web",
    status: "open",
    created_at: NOW,
    logged_at: null,
    voided_at: null,
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 5,
    position: 0,
    copy_id: 3,
    release_id: "rel-a",
    album_title: "A",
    album_artist: "Artist",
    album_thumbnail: null,
    inner_sleeve_type: null,
    last_cleaned_at: null,
    ...overrides,
  };
}

function copyRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    friend_id: 7,
    release_id: `rel-${id}`,
    is_default: true,
    label: null,
    notes: null,
    inner_sleeve_type: null,
    last_cleaned_at: null,
    deleted_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function actionRow(id: number, copyId: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    copy_id: copyId,
    friend_id: 7,
    action_type: "cleaned",
    occurred_at: NOW,
    notes: null,
    sleeve_type: null,
    details: {},
    voided_at: null,
    session_id: 5,
    source: "web",
    created_at: NOW,
    ...overrides,
  };
}

describe("RecordCareSessionService", () => {
  const service = new RecordCareSessionService();
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withDbTransaction.mockImplementation(async (fn: (c: object) => Promise<unknown>) =>
      fn(client),
    );
    mocks.getAlbumByReleaseAndFriend.mockResolvedValue({ release_id: "rel", friend_id: 7 });
    mocks.listItems.mockResolvedValue([itemRow()]);
    mocks.findCopyForUpdate.mockImplementation(async (_c: unknown, id: number) => copyRow(id));
    mocks.findCopy.mockImplementation(async (id: number) => copyRow(id));
  });

  describe("defaultStackCandidates", () => {
    it("takes the requested prefix of the complete queue order, including implicit copies", async () => {
      mocks.flattenedQueue.mockResolvedValue([
        { release_id: "rel-a", copy_id: null },
        { release_id: "rel-b", copy_id: 9 },
        { release_id: "rel-c", copy_id: 10 },
      ]);
      await expect(defaultStackCandidates(7, 2)).resolves.toEqual([
        { release_id: "rel-a", copy_id: null },
        { release_id: "rel-b", copy_id: 9 },
      ]);
      expect(mocks.flattenedQueue).toHaveBeenCalledWith(7);
    });
  });

  describe("pullStack", () => {
    it("numbers a new stack from the queue, under the friend's lock", async () => {
      mocks.findOpenStack.mockResolvedValue(null);
      mocks.flattenedQueue.mockResolvedValue([{ release_id: "rel-a", copy_id: null }]);
      mocks.nextStackNo.mockResolvedValue(3);
      mocks.insertSession.mockResolvedValue(sessionRow({ stack_no: 3 }));

      const result = await service.pullStack({ friend_id: 7, source: "cli" });

      expect(mocks.lockFriendStacks).toHaveBeenCalledWith(client, 7);
      expect(mocks.flattenedQueue).toHaveBeenCalledWith(7);
      expect(mocks.insertSession).toHaveBeenCalledWith(client, {
        friend_id: 7,
        stack_no: 3,
        source: "cli",
      });
      expect(mocks.insertItems).toHaveBeenCalledWith(client, 5, [
        { release_id: "rel-a", copy_id: null },
      ]);
      expect(result.created).toBe(true);
      expect(result.stack).toMatchObject({ stack_no: 3, created_at: ISO, logged_at: null });
      expect(result.stack.items).toEqual([
        {
          position: 0,
          copy_id: 3,
          release_id: "rel-a",
          album_title: "A",
          album_artist: "Artist",
          album_thumbnail: null,
          inner_sleeve_type: null,
          last_cleaned_at: null,
        },
      ]);
    });

    it("returns the open stack instead of making a second", async () => {
      mocks.findOpenStack.mockResolvedValue(sessionRow());

      const result = await service.pullStack({ friend_id: 7, size: 5 });

      expect(result).toMatchObject({ created: false, stack: { id: 5, stack_no: 2 } });
      expect(mocks.insertSession).not.toHaveBeenCalled();
      expect(mocks.flattenedQueue).not.toHaveBeenCalled();
    });

    it("takes an explicit stack in order, validated and deduplicated, defaulting to api", async () => {
      mocks.findOpenStack.mockResolvedValue(null);
      mocks.nextStackNo.mockResolvedValue(1);
      mocks.insertSession.mockResolvedValue(sessionRow({ stack_no: 1 }));

      await service.pullStack({
        friend_id: 7,
        size: 1,
        copies: [{ copy_id: 9 }, { release_id: "rel-x" }, { copy_id: 9 }, { release_id: "rel-x" }],
      });

      expect(mocks.flattenedQueue).not.toHaveBeenCalled();
      expect(mocks.getAlbumByReleaseAndFriend).toHaveBeenCalledWith("rel-x", 7);
      expect(mocks.insertSession).toHaveBeenCalledWith(
        client,
        expect.objectContaining({ source: "api" }),
      );
      expect(mocks.insertItems).toHaveBeenCalledWith(client, 5, [
        { release_id: "rel-9", copy_id: 9 },
        { release_id: "rel-x", copy_id: null },
      ]);
    });

    it("refuses a copy that is not the friend's, or deleted, or an album they lack", async () => {
      mocks.findCopy.mockResolvedValueOnce(null);
      await expect(service.pullStack({ friend_id: 7, copies: [{ copy_id: 1 }] })).rejects.toThrow(
        RECORD_COPY_NOT_FOUND,
      );
      mocks.findCopy.mockResolvedValueOnce(copyRow(1, { deleted_at: NOW }));
      await expect(service.pullStack({ friend_id: 7, copies: [{ copy_id: 1 }] })).rejects.toThrow(
        RECORD_COPY_NOT_FOUND,
      );
      mocks.getAlbumByReleaseAndFriend.mockResolvedValueOnce(null);
      await expect(
        service.pullStack({ friend_id: 7, copies: [{ release_id: "gone" }] }),
      ).rejects.toThrow(ALBUM_NOT_FOUND);
      expect(mocks.withDbTransaction).not.toHaveBeenCalled();
    });

    it("says so when the queue is empty", async () => {
      mocks.findOpenStack.mockResolvedValue(null);
      mocks.flattenedQueue.mockResolvedValue([]);
      await expect(service.pullStack({ friend_id: 7 })).rejects.toThrow(NOTHING_TO_PULL);
      expect(mocks.insertSession).not.toHaveBeenCalled();
    });
  });

  describe("reads", () => {
    it("gets a stack, or null when not the friend's", async () => {
      mocks.findSession.mockResolvedValueOnce(sessionRow({ logged_at: NOW, voided_at: NOW }));
      await expect(service.getStack(5, 7)).resolves.toMatchObject({
        logged_at: ISO,
        voided_at: ISO,
      });
      expect(mocks.findSession).toHaveBeenCalledWith(null, 5, 7);
      expect(mocks.listItems).toHaveBeenCalledWith(null, 7, [5]);

      mocks.findSession.mockResolvedValueOnce(null);
      await expect(service.getStack(5, 7)).resolves.toBeNull();
    });

    it("lists stacks with each one's own items", async () => {
      mocks.listStacks.mockResolvedValue([sessionRow({ id: 5 }), sessionRow({ id: 6 })]);
      mocks.listItems.mockResolvedValue([
        itemRow({ session_id: 6, last_cleaned_at: NOW }),
        itemRow({ session_id: 5, position: 1 }),
      ]);

      const stacks = await service.listStacks({
        friend_id: 7,
        status: "open",
        limit: 20,
        offset: 0,
      });

      expect(mocks.listItems).toHaveBeenCalledWith(null, 7, [5, 6]);
      expect(stacks.map((s) => s.items.map((i) => i.position))).toEqual([[1], [0]]);
      expect(stacks[1].items[0].last_cleaned_at).toBe(ISO);
    });

    it("orders a feed entry's types canonically", async () => {
      mocks.careLog.mockResolvedValue({
        items: [{ kind: "session", action_types: ["sleeved", "cleaned"], occurred_at: NOW }],
        total: 1,
      });
      await expect(service.listLog({ friend_id: 7, limit: 20, offset: 0 })).resolves.toEqual({
        items: [{ kind: "session", action_types: ["cleaned", "sleeved"], occurred_at: ISO }],
        total: 1,
      });
    });
  });

  describe("discardStack", () => {
    it("discards an open stack", async () => {
      mocks.findSession.mockResolvedValue(sessionRow());
      mocks.markDiscarded.mockResolvedValue(sessionRow({ status: "discarded" }));

      await expect(service.discardStack(5, 7)).resolves.toMatchObject({ status: "discarded" });
      expect(mocks.findSession).toHaveBeenCalledWith(client, 5, 7, { forUpdate: true });
    });

    it("is a no-op twice, null when not the friend's, and refused once logged", async () => {
      mocks.findSession.mockResolvedValueOnce(sessionRow({ status: "discarded" }));
      await expect(service.discardStack(5, 7)).resolves.toMatchObject({ status: "discarded" });
      expect(mocks.markDiscarded).not.toHaveBeenCalled();

      mocks.findSession.mockResolvedValueOnce(null);
      await expect(service.discardStack(5, 7)).resolves.toBeNull();

      mocks.findSession.mockResolvedValueOnce(sessionRow({ status: "logged" }));
      await expect(service.discardStack(5, 7)).rejects.toThrow(STACK_NOT_OPEN);
    });
  });

  describe("logSession", () => {
    beforeEach(() => {
      let nextId = 100;
      mocks.logActionInTransaction.mockImplementation(
        async (_c: unknown, input: { copy_id: number; action_type: string }) => ({
          action: actionRow(nextId++, input.copy_id, { action_type: input.action_type }),
          copy: copyRow(input.copy_id, { last_cleaned_at: NOW }),
        }),
      );
      mocks.markLogged.mockResolvedValue(sessionRow({ status: "logged", logged_at: NOW }));
    });

    it("writes one action per copy per type, in canonical type order, for a stack", async () => {
      mocks.findSession.mockResolvedValue(sessionRow());
      mocks.listItems.mockResolvedValue([
        itemRow({ copy_id: 3 }),
        itemRow({ position: 1, copy_id: null, release_id: "rel-b" }),
      ]);
      mocks.ensureDefaultCopy.mockResolvedValue(copyRow(4));

      const result = await service.logSession({
        friend_id: 7,
        stack_id: 5,
        action_types: ["sleeved", "cleaned"],
        occurred_at: ISO,
        notes: "Two passes",
        sleeve_type: "poly",
        details: { method: "vacuum" },
        source: "cli",
      });

      expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);
      expect(mocks.getAlbumByReleaseAndFriend).toHaveBeenCalledWith("rel-b", 7);
      expect(mocks.ensureDefaultCopy).toHaveBeenCalledWith(client, 7, "rel-b");
      expect(mocks.findCopyForUpdate.mock.calls.map((call) => call[1])).toEqual([3, 4]);
      expect(
        mocks.logActionInTransaction.mock.calls.map(([, input]) => [
          input.copy_id,
          input.action_type,
          input.sleeve_type,
          input.details,
        ]),
      ).toEqual([
        [3, "cleaned", undefined, { method: "vacuum" }],
        [3, "sleeved", "poly", undefined],
        [4, "cleaned", undefined, { method: "vacuum" }],
        [4, "sleeved", "poly", undefined],
      ]);
      expect(mocks.logActionInTransaction.mock.calls[0][1]).toMatchObject({
        friend_id: 7,
        session_id: 5,
        source: "cli",
        occurred_at: ISO,
        notes: "Two passes",
      });
      expect(mocks.insertItems).not.toHaveBeenCalled();
      expect(mocks.markLogged).toHaveBeenCalledWith(client, 5, "cli");
      expect(result.actions).toHaveLength(4);
      expect(result.actions[0].occurred_at).toBe(ISO);
      expect(result.copies.map((copy) => copy.id)).toEqual([3, 4]);
      expect(result.session.status).toBe("logged");
    });

    it("creates an ad-hoc session, records its copies, and stamps now", async () => {
      vi.useFakeTimers({ now: NOW });
      mocks.insertSession.mockResolvedValue(sessionRow({ stack_no: null, status: "logged" }));
      mocks.ensureDefaultCopy.mockResolvedValue(copyRow(9));

      const result = await service.logSession({
        friend_id: 7,
        // The release ref lands on the same default copy as copy 9.
        copies: [{ copy_id: 9 }, { release_id: "rel-9" }],
        action_types: ["inspected"],
      });
      vi.useRealTimers();

      expect(mocks.insertSession).toHaveBeenCalledWith(client, {
        friend_id: 7,
        stack_no: null,
        source: "api",
      });
      expect(mocks.findSession).not.toHaveBeenCalled();
      expect(mocks.insertItems).toHaveBeenCalledWith(client, 5, [
        { release_id: "rel-9", copy_id: 9 },
      ]);
      expect(mocks.logActionInTransaction).toHaveBeenCalledTimes(1);
      expect(mocks.logActionInTransaction.mock.calls[0][1]).toMatchObject({
        copy_id: 9,
        occurred_at: ISO,
        source: "api",
      });
      expect(mocks.markLogged).toHaveBeenCalledWith(client, 5, "api");
      expect(result.copies).toHaveLength(1);
    });

    it("lets a failure part-way escape the one transaction, so nothing is kept", async () => {
      mocks.findSession.mockResolvedValue(sessionRow());
      mocks.listItems.mockResolvedValue([itemRow({ copy_id: 3 }), itemRow({ copy_id: 4 })]);
      mocks.logActionInTransaction
        .mockResolvedValueOnce({ action: actionRow(1, 3), copy: copyRow(3) })
        .mockRejectedValueOnce(new Error("check constraint"));

      await expect(
        service.logSession({ friend_id: 7, stack_id: 5, action_types: ["cleaned"] }),
      ).rejects.toThrow("check constraint");

      // Both writes ran inside the single transaction callback, which threw.
      expect(mocks.withDbTransaction).toHaveBeenCalledTimes(1);
      expect(mocks.logActionInTransaction).toHaveBeenCalledTimes(2);
      expect(mocks.markLogged).not.toHaveBeenCalled();
    });

    it("refuses a missing, closed or vanished stack and an unowned copy", async () => {
      const input = { friend_id: 7, stack_id: 5, action_types: ["cleaned" as const] };

      mocks.findSession.mockResolvedValueOnce(null);
      await expect(service.logSession(input)).rejects.toThrow(RECORD_CARE_SESSION_NOT_FOUND);

      mocks.findSession.mockResolvedValueOnce(sessionRow({ status: "logged" }));
      await expect(service.logSession(input)).rejects.toThrow(STACK_NOT_OPEN);

      mocks.findSession.mockResolvedValueOnce(sessionRow());
      mocks.listItems.mockResolvedValueOnce([itemRow({ copy_id: null, release_id: "gone" })]);
      mocks.getAlbumByReleaseAndFriend.mockResolvedValueOnce(null);
      await expect(service.logSession(input)).rejects.toThrow(ALBUM_NOT_FOUND);

      mocks.findSession.mockResolvedValueOnce(sessionRow());
      mocks.findCopyForUpdate.mockResolvedValueOnce(null);
      await expect(service.logSession(input)).rejects.toThrow(RECORD_COPY_NOT_FOUND);

      expect(mocks.logActionInTransaction).not.toHaveBeenCalled();
      expect(mocks.markLogged).not.toHaveBeenCalled();
    });
  });

  describe("voidSession", () => {
    beforeEach(() => {
      mocks.voidActionInTransaction.mockImplementation(
        async (_c: unknown, action: { id: number; copy_id: number }) => ({
          action: actionRow(action.id, action.copy_id, { voided_at: NOW }),
          copy: copyRow(action.copy_id),
        }),
      );
    });

    it("voids every live action, recomputes each copy and reopens the stack", async () => {
      mocks.findSession.mockResolvedValue(sessionRow({ status: "logged", logged_at: NOW }));
      mocks.findOpenStack.mockResolvedValue(null);
      mocks.listLiveSessionActions.mockResolvedValue([
        actionRow(1, 4),
        actionRow(2, 3),
        actionRow(3, 4, { action_type: "sleeved" }),
      ]);
      mocks.markVoided.mockResolvedValue(sessionRow({ status: "open", voided_at: NOW }));

      const result = await service.voidSession(5, 7);

      expect(mocks.lockFriendStacks).toHaveBeenCalledWith(client, 7);
      expect(mocks.findCopyForUpdate.mock.calls.map((call) => [call[1], call[3]])).toEqual([
        [3, { includeDeleted: true }],
        [4, { includeDeleted: true }],
      ]);
      expect(mocks.voidActionInTransaction.mock.calls.map(([, action]) => action.id)).toEqual([
        1, 2, 3,
      ]);
      expect(mocks.markVoided).toHaveBeenCalledWith(client, 5);
      expect(result?.session).toMatchObject({ status: "open", voided_at: ISO });
      expect(result?.actions.every((action) => action.voided_at === ISO)).toBe(true);
      expect(result?.copies.map((copy) => copy.id)).toEqual([4, 3]);
    });

    it("undoes an ad-hoc log without touching the open-stack lock", async () => {
      mocks.findSession.mockResolvedValue(sessionRow({ stack_no: null, status: "logged" }));
      mocks.listLiveSessionActions.mockResolvedValue([actionRow(1, 3)]);
      mocks.markVoided.mockResolvedValue(sessionRow({ stack_no: null, status: "logged" }));

      await expect(service.voidSession(5, 7)).resolves.toMatchObject({
        session: { status: "logged" },
      });
      expect(mocks.lockFriendStacks).not.toHaveBeenCalled();
    });

    it("refuses what has nothing logged, and a reopen beside another open stack", async () => {
      mocks.findSession.mockResolvedValueOnce(null);
      await expect(service.voidSession(5, 7)).resolves.toBeNull();

      mocks.findSession.mockResolvedValueOnce(sessionRow({ status: "open" }));
      await expect(service.voidSession(5, 7)).rejects.toThrow(SESSION_NOT_LOGGED);

      mocks.findSession.mockResolvedValueOnce(
        sessionRow({ stack_no: null, status: "logged", voided_at: NOW }),
      );
      await expect(service.voidSession(5, 7)).rejects.toThrow(SESSION_NOT_LOGGED);

      mocks.findSession.mockResolvedValueOnce(sessionRow({ status: "logged" }));
      mocks.findOpenStack.mockResolvedValueOnce(sessionRow({ id: 6 }));
      await expect(service.voidSession(5, 7)).rejects.toThrow(ANOTHER_STACK_OPEN);

      expect(mocks.voidActionInTransaction).not.toHaveBeenCalled();
    });
  });
});
