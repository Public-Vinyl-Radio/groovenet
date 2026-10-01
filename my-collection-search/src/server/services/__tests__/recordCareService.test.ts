import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withDbTransaction: vi.fn(),
  getAlbumByReleaseAndFriend: vi.fn(),
  listCopies: vi.fn(),
  findCopy: vi.fn(),
  findCopyForUpdate: vi.fn(),
  ensureDefaultCopy: vi.fn(),
  createCopy: vi.fn(),
  updateCopy: vi.fn(),
  countSiblings: vi.fn(),
  softDeleteCopy: vi.fn(),
  refreshCareState: vi.fn(),
  listCare: vi.fn(),
  careCounts: vi.fn(),
  countBySleeveType: vi.fn(),
  insertAction: vi.fn(),
  listActions: vi.fn(),
  findAction: vi.fn(),
  voidAction: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mocks.withDbTransaction }));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: { getAlbumByReleaseAndFriend: mocks.getAlbumByReleaseAndFriend },
}));
vi.mock("@/server/repositories/recordCopyRepository", () => ({
  recordCopyRepository: {
    listCopies: mocks.listCopies,
    findCopy: mocks.findCopy,
    findCopyForUpdate: mocks.findCopyForUpdate,
    ensureDefaultCopy: mocks.ensureDefaultCopy,
    createCopy: mocks.createCopy,
    updateCopy: mocks.updateCopy,
    countSiblings: mocks.countSiblings,
    softDeleteCopy: mocks.softDeleteCopy,
    refreshCareState: mocks.refreshCareState,
    listCare: mocks.listCare,
    careCounts: mocks.careCounts,
    countBySleeveType: mocks.countBySleeveType,
  },
}));
vi.mock("@/server/repositories/recordActionRepository", () => ({
  recordActionRepository: {
    insertAction: mocks.insertAction,
    listActions: mocks.listActions,
    findAction: mocks.findAction,
    voidAction: mocks.voidAction,
  },
}));

import {
  ALBUM_NOT_FOUND,
  DEFAULT_COPY_HAS_SIBLINGS,
  RECORD_COPY_NOT_FOUND,
  RecordCareService,
} from "../recordCareService";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function copyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    friend_id: 7,
    release_id: "rel",
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

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    copy_id: 3,
    friend_id: 7,
    action_type: "cleaned",
    occurred_at: NOW,
    notes: null,
    sleeve_type: null,
    details: {},
    voided_at: null,
    created_at: NOW,
    ...overrides,
  };
}

describe("RecordCareService", () => {
  const service = new RecordCareService();
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withDbTransaction.mockImplementation(async (fn: (c: object) => Promise<unknown>) =>
      fn(client)
    );
    mocks.getAlbumByReleaseAndFriend.mockResolvedValue({ release_id: "rel", friend_id: 7 });
  });

  afterEach(() => {
    delete process.env.RECORD_CLEANING_OVERDUE_DAYS;
  });

  describe("logAction", () => {
    it("lands a release-level action on the default copy, created on demand", async () => {
      mocks.ensureDefaultCopy.mockResolvedValue(copyRow());
      mocks.findCopyForUpdate.mockResolvedValue(copyRow());
      mocks.insertAction.mockResolvedValue(actionRow());
      mocks.refreshCareState.mockResolvedValue(copyRow({ last_cleaned_at: NOW }));

      const result = await service.logAction({
        friend_id: 7,
        release_id: "rel",
        action_type: "cleaned",
        occurred_at: "2026-10-01T12:00:00.000Z",
        details: { method: "ultrasonic" },
      });

      expect(mocks.ensureDefaultCopy).toHaveBeenCalledWith(client, 7, "rel");
      expect(mocks.insertAction).toHaveBeenCalledWith(client, {
        copy_id: 3,
        friend_id: 7,
        action_type: "cleaned",
        occurred_at: "2026-10-01T12:00:00.000Z",
        notes: undefined,
        sleeve_type: null,
        details: { method: "ultrasonic" },
      });
      expect(result.copy.last_cleaned_at).toBe("2026-10-01T12:00:00.000Z");
      expect(result.action.occurred_at).toBe("2026-10-01T12:00:00.000Z");
    });

    it("locks the copy before writing the action, then rebuilds its care state", async () => {
      const order: string[] = [];
      mocks.findCopyForUpdate.mockImplementation(async () => {
        order.push("lock");
        return copyRow();
      });
      mocks.insertAction.mockImplementation(async () => {
        order.push("insert");
        return actionRow({ action_type: "sleeved", sleeve_type: "poly" });
      });
      mocks.refreshCareState.mockImplementation(async () => {
        order.push("refresh");
        return copyRow({ inner_sleeve_type: "poly" });
      });

      const result = await service.logAction({
        friend_id: 7,
        copy_id: 3,
        action_type: "sleeved",
        sleeve_type: "poly",
      });

      expect(order).toEqual(["lock", "insert", "refresh"]);
      expect(mocks.ensureDefaultCopy).not.toHaveBeenCalled();
      expect(mocks.getAlbumByReleaseAndFriend).not.toHaveBeenCalled();
      expect(mocks.insertAction.mock.calls[0][1]).toMatchObject({ sleeve_type: "poly" });
      expect(result.copy.inner_sleeve_type).toBe("poly");
    });

    it("defaults occurred_at to now", async () => {
      mocks.findCopyForUpdate.mockResolvedValue(copyRow());
      mocks.insertAction.mockResolvedValue(actionRow());
      mocks.refreshCareState.mockResolvedValue(copyRow());

      await service.logAction({ friend_id: 7, copy_id: 3, action_type: "inspected" });

      expect(mocks.insertAction.mock.calls[0][1].occurred_at).toBeInstanceOf(Date);
    });

    it("refuses a release that is not in the collection", async () => {
      mocks.getAlbumByReleaseAndFriend.mockResolvedValue(null);

      await expect(
        service.logAction({ friend_id: 7, release_id: "gone", action_type: "cleaned" })
      ).rejects.toThrow(ALBUM_NOT_FOUND);
      expect(mocks.withDbTransaction).not.toHaveBeenCalled();
    });

    it("refuses a copy that is not the friend's or is deleted", async () => {
      mocks.findCopyForUpdate.mockResolvedValue(null);

      await expect(
        service.logAction({ friend_id: 7, copy_id: 99, action_type: "cleaned" })
      ).rejects.toThrow(RECORD_COPY_NOT_FOUND);
      expect(mocks.insertAction).not.toHaveBeenCalled();
    });
  });

  describe("voidAction", () => {
    it("locks the copy, deleted or not, voids the action and rebuilds care state", async () => {
      mocks.findAction.mockResolvedValue(actionRow());
      mocks.findCopyForUpdate.mockResolvedValue(copyRow());
      mocks.voidAction.mockResolvedValue(actionRow({ voided_at: NOW }));
      mocks.refreshCareState.mockResolvedValue(copyRow());

      const result = await service.voidAction(11, 7);

      expect(mocks.findCopyForUpdate).toHaveBeenCalledWith(client, 3, 7, {
        includeDeleted: true,
      });
      expect(mocks.refreshCareState).toHaveBeenCalledWith(client, 3);
      expect(result?.action.voided_at).toBe("2026-10-01T12:00:00.000Z");
    });

    it("is null for an action that is not the friend's", async () => {
      mocks.findAction.mockResolvedValue(null);
      await expect(service.voidAction(11, 8)).resolves.toBeNull();
      expect(mocks.voidAction).not.toHaveBeenCalled();
    });
  });

  describe("copies", () => {
    it("creates a copy only for a release in the collection", async () => {
      mocks.createCopy.mockResolvedValue(copyRow({ label: "Copy 2", is_default: false }));

      const copy = await service.createCopy({ friend_id: 7, release_id: "rel", label: "Copy 2" });
      expect(copy.label).toBe("Copy 2");

      mocks.getAlbumByReleaseAndFriend.mockResolvedValue(null);
      await expect(service.createCopy({ friend_id: 7, release_id: "gone" })).rejects.toThrow(
        ALBUM_NOT_FOUND
      );
    });

    it("will not delete the default copy while the release has others", async () => {
      mocks.findCopyForUpdate.mockResolvedValue(copyRow());
      mocks.countSiblings.mockResolvedValue(1);

      await expect(service.deleteCopy(3, 7)).rejects.toThrow(DEFAULT_COPY_HAS_SIBLINGS);
      expect(mocks.softDeleteCopy).not.toHaveBeenCalled();
    });

    it("soft-deletes an extra copy without counting siblings", async () => {
      mocks.findCopyForUpdate.mockResolvedValue(copyRow({ is_default: false }));
      mocks.softDeleteCopy.mockResolvedValue(copyRow({ is_default: false, deleted_at: NOW }));

      const deleted = await service.deleteCopy(3, 7);

      expect(mocks.countSiblings).not.toHaveBeenCalled();
      expect(deleted?.deleted_at).toBe("2026-10-01T12:00:00.000Z");
    });

    it("is null when updating or deleting a copy that is not the friend's", async () => {
      mocks.findCopyForUpdate.mockResolvedValue(null);
      await expect(service.updateCopy(3, 8, { label: "x" })).resolves.toBeNull();
      await expect(service.deleteCopy(3, 8)).resolves.toBeNull();
    });

    it("lists history only for the friend's copy", async () => {
      mocks.findCopy.mockResolvedValueOnce(null);
      await expect(service.listActions({ copy_id: 3, friend_id: 8 })).resolves.toBeNull();

      mocks.findCopy.mockResolvedValueOnce(copyRow({ deleted_at: NOW }));
      mocks.listActions.mockResolvedValueOnce([actionRow()]);
      await expect(service.listActions({ copy_id: 3, friend_id: 7 })).resolves.toHaveLength(1);
    });
  });

  describe("care views", () => {
    it("defaults the overdue window from RECORD_CLEANING_OVERDUE_DAYS and the target sleeve", async () => {
      process.env.RECORD_CLEANING_OVERDUE_DAYS = "180";
      mocks.listCare.mockResolvedValue({ items: [], total: 0 });

      const result = await service.listCare({ friend_id: 7, status: "overdue" });

      expect(mocks.listCare).toHaveBeenCalledWith({
        friend_id: 7,
        status: "overdue",
        overdue_days: 180,
        needs_sleeve: "poly-rice-paper-poly",
      });
      expect(result).toMatchObject({ overdue_days: 180, needs_sleeve_type: "poly-rice-paper-poly" });
    });

    it("falls back to 365 days when the env var is missing or not a positive integer", async () => {
      mocks.listCare.mockResolvedValue({ items: [], total: 0 });

      await service.listCare({ friend_id: 7 });
      process.env.RECORD_CLEANING_OVERDUE_DAYS = "soon";
      await service.listCare({ friend_id: 7 });

      expect(mocks.listCare.mock.calls[0][0].overdue_days).toBe(365);
      expect(mocks.listCare.mock.calls[1][0].overdue_days).toBe(365);
    });

    it("lets a request override both", async () => {
      process.env.RECORD_CLEANING_OVERDUE_DAYS = "180";
      mocks.careCounts.mockResolvedValue({ total: 0, never_cleaned: 0, overdue: 0, needs_sleeve: 0 });
      mocks.countBySleeveType.mockResolvedValue([]);

      await service.careSummary(7, { overdue_days: 30, needs_sleeve: "paper" });

      expect(mocks.careCounts).toHaveBeenCalledWith(7, 30, "paper");
    });

    it("zero-fills every sleeve type and counts none logged as unknown", async () => {
      mocks.careCounts.mockResolvedValue({ total: 5, never_cleaned: 4, overdue: 1, needs_sleeve: 4 });
      mocks.countBySleeveType.mockResolvedValue([
        { sleeve_type: null, count: 4 },
        { sleeve_type: "poly-rice-paper-poly", count: 1 },
      ]);

      const summary = await service.careSummary(7);

      expect(summary.by_sleeve_type).toEqual({
        original: 0,
        paper: 0,
        "poly-rice-paper-poly": 1,
        poly: 0,
        unknown: 4,
      });
      expect(summary).toMatchObject({ total: 5, overdue_days: 365 });
    });
  });
});
