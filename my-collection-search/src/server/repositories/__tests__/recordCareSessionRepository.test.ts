import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { RecordCareSessionRepository } from "../recordCareSessionRepository";

// The SQL itself runs against Postgres in recordCareSessionService.integration.test.ts;
// these pin parameters and the branches the repository chooses between.
const repo = new RecordCareSessionRepository();

function clientReturning(rows: unknown[]) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe("RecordCareSessionRepository", () => {
  beforeEach(() => vi.resetAllMocks());

  it("takes the friend's advisory lock", async () => {
    const client = clientReturning([]);
    await repo.lockFriendStacks(client, 7);
    expect(client.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(client.query.mock.calls[0][1]).toEqual([7]);
  });

  it("finds the open stack, or null", async () => {
    await expect(repo.findOpenStack(clientReturning([{ id: 5 }]), 7)).resolves.toEqual({ id: 5 });
    await expect(repo.findOpenStack(clientReturning([]), 7)).resolves.toBeNull();
  });

  it("numbers stacks past every one not discarded", async () => {
    const client = clientReturning([{ next: 3 }]);
    await expect(repo.nextStackNo(client, 7)).resolves.toBe(3);
    expect(client.query.mock.calls[0][0]).toContain("status <> 'discarded'");
  });

  it("inserts a session and its items in order", async () => {
    const client = clientReturning([{ id: 5 }]);
    await expect(
      repo.insertSession(client, { friend_id: 7, stack_no: null, source: "web" }),
    ).resolves.toEqual({ id: 5 });
    expect(client.query.mock.calls[0][1]).toEqual([7, null, "web"]);

    await repo.insertItems(client, 5, [
      { release_id: "a", copy_id: null },
      { release_id: "b", copy_id: 9 },
    ]);
    expect(client.query.mock.calls[1][0]).toContain("WITH ORDINALITY");
    expect(client.query.mock.calls[1][1]).toEqual([5, ["a", "b"], [null, 9]]);
  });

  it("finds a session through the client or the pool, locked when asked", async () => {
    const client = clientReturning([{ id: 5 }]);
    await expect(repo.findSession(client, 5, 7, { forUpdate: true })).resolves.toEqual({ id: 5 });
    expect(client.query.mock.calls[0][0]).toContain("FOR UPDATE");

    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.findSession(null, 5, 7)).resolves.toBeNull();
    expect(dbQuery.mock.calls[0][0]).not.toContain("FOR UPDATE");
    expect(dbQuery.mock.calls[0][1]).toEqual([5, 7]);
  });

  it("lists stacks, with an optional status", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await repo.listStacks({ friend_id: 7, limit: 20, offset: 0 });
    await repo.listStacks({ friend_id: 7, status: "open", limit: 5, offset: 10 });

    expect(dbQuery.mock.calls[0][0]).toContain("stack_no IS NOT NULL");
    expect(dbQuery.mock.calls[0][0]).not.toContain("status = $4");
    expect(dbQuery.mock.calls[0][1]).toEqual([7, 20, 0]);
    expect(dbQuery.mock.calls[1][0]).toContain("status = $4");
    expect(dbQuery.mock.calls[1][1]).toEqual([7, 5, 10, "open"]);
  });

  it("lists items for several sessions, skipping the query for none", async () => {
    await expect(repo.listItems(null, 7, [])).resolves.toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();

    const client = clientReturning([{ session_id: 5 }]);
    await expect(repo.listItems(client, 7, [5, 6])).resolves.toEqual([{ session_id: 5 }]);
    expect(client.query.mock.calls[0][1]).toEqual([7, [5, 6]]);

    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo.listItems(null, 7, [5])).resolves.toEqual([]);
    expect(dbQuery.mock.calls[0][1]).toEqual([7, [5]]);
  });

  it("marks a session logged, voided or discarded", async () => {
    const client = clientReturning([{ id: 5 }]);
    await repo.markLogged(client, 5, "mcp");
    await repo.markVoided(client, 5);
    await repo.markDiscarded(client, 5);

    expect(client.query.mock.calls[0][0]).toContain("voided_at = NULL");
    expect(client.query.mock.calls[0][1]).toEqual([5, "mcp"]);
    expect(client.query.mock.calls[1][0]).toContain("voided_at = NOW()");
    expect(client.query.mock.calls[2][0]).toContain("status = 'discarded'");
  });

  it("pages the care log with a total", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ kind: "session" }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] });

    await expect(repo.careLog({ friend_id: 7, limit: 20, offset: 0 })).resolves.toEqual({
      items: [{ kind: "session" }],
      total: 4,
    });
    expect(dbQuery.mock.calls[0][0]).toContain("UNION ALL");
    expect(dbQuery.mock.calls[0][1]).toEqual([7, 20, 0]);
    expect(dbQuery.mock.calls[1][1]).toEqual([7]);

    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.careLog({ friend_id: 7, limit: 20, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0,
    });
  });
});
