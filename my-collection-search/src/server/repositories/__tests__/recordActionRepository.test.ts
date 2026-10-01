import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { RecordActionRepository } from "../recordActionRepository";

const repo = new RecordActionRepository();

describe("RecordActionRepository", () => {
  beforeEach(() => vi.resetAllMocks());

  it("inserts an action with its details as JSON", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });

    await repo.insertAction(
      { query },
      {
        copy_id: 3,
        friend_id: 7,
        action_type: "cleaned",
        occurred_at: "2026-09-30T19:00:00.000Z",
        details: { method: "ultrasonic" },
      }
    );

    expect(query.mock.calls[0][1]).toEqual([
      3, 7, "cleaned", "2026-09-30T19:00:00.000Z", null, null, '{"method":"ultrasonic"}',
    ]);
  });

  it("lists live actions newest first by default", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    await repo.listActions({ copy_id: 3, friend_id: 7 });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("voided_at IS NULL");
    expect(sql).toContain("ORDER BY occurred_at DESC, id DESC");
    expect(params).toEqual([3, 7, 50, 0]);
  });

  it("can filter by type and include voided actions", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    await repo.listActions({
      copy_id: 3,
      friend_id: 7,
      action_type: "sleeved",
      include_voided: true,
      limit: 5,
      offset: 10,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("action_type = $3");
    expect(sql).not.toContain("voided_at IS NULL");
    expect(params).toEqual([3, 7, "sleeved", 5, 10]);
  });

  it("keeps the first voided_at when voided twice", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });

    await repo.voidAction({ query }, 1);

    expect(query.mock.calls[0][0]).toContain("voided_at = COALESCE(voided_at, NOW())");
  });
});
