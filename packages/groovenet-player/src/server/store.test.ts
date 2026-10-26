import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresPlayerStore } from "./store.js";
const state = { queue: [], current_entry_id: null, status: "stopped" as const, position: 0, duration: null, volume: 50, desired_output: null, checkpoint: true, error: null };
const row = { id: "lounge", name: "Lounge", engine_id: "a", availability_policy: "ask", revision: "1", assigned_output: null, state };
function fixture() {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => { void _sql; void _values; return { rows: [row] as unknown[] }; });
  const lease = Object.assign(new EventEmitter(), { query: vi.fn(async () => ({ rows: [{ acquired: true }] })), release: vi.fn() });
  const pool = Object.assign(new EventEmitter(), { query, connect: vi.fn(async () => lease), end: vi.fn(async () => {}) });
  const store = new PostgresPlayerStore(pool as unknown as Pool);
  return { store, pool, query, lease };
}
describe("Postgres player persistence", () => {
  it("holds an exclusive worker advisory lock and checks its connection", async () => {
    const f = fixture(); const lost = vi.fn();
    await f.store.acquire(lost); await f.store.heartbeat();
    f.lease.emit("error", new Error("lost"));
    expect(lost).toHaveBeenCalledTimes(1);
    await f.store.release();
    expect(f.lease.query.mock.calls.map(c => c[0])).toEqual(["SELECT pg_try_advisory_lock(693, 1) AS acquired", "SELECT 1", "SELECT pg_advisory_unlock(693, 1)"]);
    expect(f.lease.release).toHaveBeenCalledOnce(); expect(f.pool.end).toHaveBeenCalledOnce();
    expect(f.pool.listenerCount("error")).toBe(0);
  });
  it("refuses a second worker and releases its connection", async () => {
    const f = fixture(); f.lease.query.mockResolvedValue({ rows: [{ acquired: false }] });
    await expect(f.store.acquire(vi.fn())).rejects.toMatchObject({ code: "WORKER_ALREADY_RUNNING" });
    expect(f.lease.release).toHaveBeenCalledOnce();
    await expect(f.store.heartbeat()).rejects.toMatchObject({ code: "WORKER_UNAVAILABLE" });
    await f.store.release();
  });
  it("ends the pool even if the lost lease cannot be unlocked", async () => {
    const f = fixture(); await f.store.acquire(vi.fn());
    f.lease.query.mockRejectedValue(new Error("connection lost"));
    await expect(f.store.release()).rejects.toThrow("connection lost");
    expect(f.lease.release).toHaveBeenCalledOnce(); expect(f.pool.end).toHaveBeenCalledOnce();
  });
  it("fails closed on an idle pool connection error", async () => {
    const f = fixture(); const lost = vi.fn(); await f.store.acquire(lost);
    f.pool.emit("error", new Error("idle connection lost"));
    expect(lost).toHaveBeenCalledOnce(); await f.store.release();
  });
  it("normalizes numeric revisions and persists parameterized JSON with CAS", async () => {
    const f = fixture();
    expect((await f.store.list())[0]!.revision).toBe(1);
    const player = await f.store.create({ id: "lounge", name: "Lounge", engine_id: "a" }, state);
    await f.store.save(player, 1); await f.store.checkpoint(player);
    expect(f.query.mock.calls[1]![1]).toEqual(["lounge", "Lounge", "a", JSON.stringify(state)]);
    expect(f.query.mock.calls[2]![0]).toContain("AND revision=$6");
    expect(f.query.mock.calls[2]![1]).toEqual(["lounge", "Lounge", null, JSON.stringify(state), "ask", 1]);
    expect(f.query.mock.calls[3]![0]).not.toContain("revision=revision+1");
  });
  it("rejects stale revisions and maps unique engine/output conflicts", async () => {
    const f = fixture(); f.query.mockResolvedValue({ rows: [] });
    await expect(f.store.save({ ...row, revision: 0 }, 0)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    f.query.mockRejectedValue({ code: "23505" });
    await expect(f.store.create({ id: "lounge", name: "Lounge", engine_id: "a" }, state)).rejects.toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
    f.query.mockRejectedValue(new Error("database unavailable"));
    await expect(f.store.save({ ...row, revision: 0 }, 0)).rejects.toThrow("database unavailable");
  });
  it("requires an unambiguous current track and uses both collection reference fields", async () => {
    const f = fixture();
    f.query.mockResolvedValue({ rows: [{ track_id: "one" }] });
    expect(await f.store.resolve({ track_id: "one", friend_id: 7 })).toEqual({ track_id: "one" });
    expect(f.query).toHaveBeenLastCalledWith(expect.stringContaining("track_id=$1 AND friend_id=$2"), ["one", 7]);
    f.query.mockResolvedValue({ rows: [{}, {}] });
    expect(await f.store.resolve({ track_id: "one", friend_id: 7 })).toBeNull();
  });
});
