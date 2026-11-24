/**
 * Discogs import jobs against a real Postgres (#1274): the partial unique
 * index that allows one active import per username under concurrent
 * requests, `FOR UPDATE SKIP LOCKED` handing one row to one of several
 * claimants, the lease (a live one is not claimable, an expired one is, and
 * a worker that lost it can write nothing), and the log. A mocked driver
 * accepts all of this SQL. Run with `just discogs-imports-test`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { DiscogsImportRepository } from "../discogsImportRepository";

const enabled = process.env.RUN_DB_TESTS === "1";
const dbTest = it.skipIf(!enabled);
const repo = new DiscogsImportRepository();
const PREFIX = "discogs-import-test-";

async function cleanup() {
  await dbQuery(`DELETE FROM discogs_imports WHERE username ILIKE $1`, [`${PREFIX}%`]);
}

/** Run the expiry clock forward: the lease ran out (its process died). */
async function expireLease(id: number) {
  await dbQuery(
    `UPDATE discogs_imports SET lease_expires_at = now() - interval '1 second' WHERE id = $1`,
    [id],
  );
}

beforeEach(async () => {
  if (enabled) await cleanup();
});

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await dbPool.end();
});

describe("discogs imports (integration)", () => {
  dbTest("ten concurrent requests for one username queue exactly one import", async () => {
    const user = `${PREFIX}race`;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => repo.create(i % 2 ? user : user.toUpperCase())),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.row.id)).size).toBe(1);
    const { rows } = await dbQuery(
      `SELECT count(*)::int AS n FROM discogs_imports WHERE username ILIKE $1`,
      [user],
    );
    expect(rows[0].n).toBe(1);
  });

  dbTest("the database itself refuses a second active import, but not after one ends", async () => {
    const user = `${PREFIX}index`;
    const first = await repo.create(user);
    await expect(
      dbQuery(`INSERT INTO discogs_imports (username, status) VALUES ($1, 'running')`, [user]),
    ).rejects.toThrow(/discogs_imports_one_active_per_username/);

    const claimed = await repo.claimNext("worker-a", 60);
    expect(claimed?.id).toBe(first.row.id);
    expect(await repo.finish(first.row.id, "worker-a", "failed", "HTTP 401")).toBe(true);

    const second = await repo.create(user);
    expect(second.created).toBe(true);
    expect(second.row.id).not.toBe(first.row.id);
    expect((await repo.listLatest()).find((r) => r.username === user)?.id).toBe(second.row.id);
    expect((await repo.findActive(user))?.id).toBe(second.row.id);
  });

  dbTest("concurrent claims hand each row to one worker only", async () => {
    const a = await repo.create(`${PREFIX}claim-a`);
    const b = await repo.create(`${PREFIX}claim-b`);
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, i) => repo.claimNext(`worker-${i}`, 60)),
    );
    const ids = claims.filter((c) => c !== null).map((c) => c!.id);
    expect(ids.filter((id) => id === a.row.id)).toHaveLength(1);
    expect(ids.filter((id) => id === b.row.id)).toHaveLength(1);
    // Rows of other tests may exist; none of ours is claimed twice.
    expect(new Set(ids).size).toBe(ids.length);
  });

  dbTest("a held lease is not claimable; an expired one resumes under a new owner", async () => {
    const job = await repo.create(`${PREFIX}lease`);
    const first = await repo.claimNext("worker-a", 60);
    expect(first).toMatchObject({ id: job.row.id, status: "running", attempts: 1, stalled: false });
    expect((await repo.claimNext("worker-b", 60))?.id).not.toBe(job.row.id);

    expect(await repo.heartbeat(job.row.id, "worker-a", 60)).toBe(true);
    expect(await repo.updateProgress(job.row.id, "worker-a", { phase: "fetching", total: 4 })).toBe(
      true,
    );

    await expireLease(job.row.id);
    expect((await repo.get(job.row.id))?.stalled).toBe(true);
    const resumed = await repo.claimNext("worker-b", 60);
    expect(resumed).toMatchObject({
      id: job.row.id,
      attempts: 2,
      phase: "fetching",
      total: 4,
      stalled: false,
    });

    // The worker that lost it can neither renew, report nor finish.
    expect(await repo.heartbeat(job.row.id, "worker-a", 60)).toBe(false);
    expect(await repo.updateProgress(job.row.id, "worker-a", { fetched: 9 })).toBe(false);
    expect(await repo.finish(job.row.id, "worker-a", "completed", null)).toBe(false);

    expect(await repo.finish(job.row.id, "worker-b", "completed", null)).toBe(true);
    expect(await repo.get(job.row.id)).toMatchObject({
      status: "completed",
      phase: "done",
      lease_owner: null,
      fetched: 0,
    });
    expect((await repo.listLatest({ activeOnly: true })).map((r) => r.id)).not.toContain(
      job.row.id,
    );
  });

  dbTest("keeps the log in order, pages it and prunes old imports with their logs", async () => {
    const user = `${PREFIX}log`;
    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { row } = await repo.create(user);
      ids.push(row.id);
      await repo.appendLog(row.id, [`line ${i}a`, `line ${i}b`]);
      await repo.claimNext(`worker-${i}`, 60);
      await repo.finish(row.id, `worker-${i}`, "completed", null);
    }
    const page = await repo.readLog(ids[2], 0, 1);
    expect(page.map((l) => l.line)).toEqual(["line 2a"]);
    expect((await repo.readLog(ids[2], page[0].id, 10)).map((l) => l.line)).toEqual(["line 2b"]);

    await repo.prune(user, 1);
    expect(await repo.get(ids[0])).toBeNull();
    expect(await repo.get(ids[2])).not.toBeNull();
    const { rows } = await dbQuery(
      `SELECT count(*)::int AS n FROM discogs_import_log WHERE import_id = $1`,
      [ids[0]],
    );
    expect(rows[0].n).toBe(0);
  });
});
