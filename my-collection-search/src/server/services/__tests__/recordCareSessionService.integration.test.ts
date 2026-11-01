/**
 * Care stacks and batch logs, against a real Postgres (#941).
 *
 * What a mocked driver cannot tell us: that a failure part-way through a batch
 * rolls back every action and every default copy it made, that undo rebuilds
 * the cached care state from the actions left, that stack numbers are a
 * per-friend sequence the partial unique indexes allow, that concurrent pulls
 * agree on one stack, and that the care log's UNION and array aggregates
 * type-check. Run with `just record-care-test`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { recordCareService } from "../recordCareService";
import { RecordCareSessionService } from "../recordCareSessionService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const service = new RecordCareSessionService();

const USERNAMES = ["record-care-stacks-a", "record-care-stacks-b"];
const RELEASES = ["stacks-r1", "stacks-r2", "stacks-r3", "stacks-r4"];
let friendA = 0;
let friendB = 0;

async function cleanup() {
  // Sessions, copies and actions cascade from the friend.
  await dbQuery(`DELETE FROM albums WHERE release_id = ANY($1::text[])`, [RELEASES]);
  await dbQuery(`DELETE FROM friends WHERE username = ANY($1::text[])`, [USERNAMES]);
}

async function resetCare(friendId: number) {
  await dbQuery(`DELETE FROM record_care_sessions WHERE friend_id = $1`, [friendId]);
  await dbQuery(`DELETE FROM record_copies WHERE friend_id = $1`, [friendId]);
}

const iso = (value: string) => new Date(value).toISOString();

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const ids: number[] = [];
  for (const username of USERNAMES) {
    const { rows } = await dbQuery<{ id: number }>(
      `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
      [username],
    );
    ids.push(rows[0].id);
    // Artist order differs from release order, so A–Z is visible.
    for (const [index, releaseId] of RELEASES.entries()) {
      await dbQuery(
        `INSERT INTO albums (release_id, friend_id, title, artist) VALUES ($1, $2, $3, $4)`,
        [releaseId, rows[0].id, `Album ${index}`, `Artist ${RELEASES.length - index}`],
      );
    }
  }
  [friendA, friendB] = ids;
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (process.env.RUN_DB_TESTS !== "1") return;
  await resetCare(friendA);
  await resetCare(friendB);
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("stacks", () => {
  dbTest("pulls never-cleaned copies A–Z and returns the open stack again", async () => {
    const pulls = await Promise.all(
      Array.from({ length: 4 }, () => service.pullStack({ friend_id: friendA, size: 3 })),
    );
    expect(pulls.filter((pull) => pull.created)).toHaveLength(1);
    expect(new Set(pulls.map((pull) => pull.stack.id)).size).toBe(1);

    const { stack } = pulls[0];
    expect(stack.stack_no).toBe(1);
    expect(stack.items.map((item) => item.album_artist)).toEqual([
      "Artist 1",
      "Artist 2",
      "Artist 3",
    ]);
    expect(stack.items.every((item) => item.copy_id === null)).toBe(true);
    await expect(service.getStack(stack.id, friendA)).resolves.toEqual(stack);
    await expect(service.getStack(stack.id, friendB)).resolves.toBeNull();
  });

  dbTest("numbers stacks per friend, and a discarded stack gives its number back", async () => {
    const first = await service.pullStack({ friend_id: friendA, size: 1 });
    await service.logSession({
      friend_id: friendA,
      stack_id: first.stack.id,
      action_types: ["cleaned"],
    });
    const second = await service.pullStack({ friend_id: friendA, size: 1 });
    expect(second.stack.stack_no).toBe(2);
    // The cleaned copy has left the queue.
    expect(second.stack.items[0].release_id).not.toBe(first.stack.items[0].release_id);

    const other = await service.pullStack({ friend_id: friendB, size: 1 });
    expect(other.stack.stack_no).toBe(1);

    await expect(service.discardStack(second.stack.id, friendA)).resolves.toMatchObject({
      status: "discarded",
    });
    const third = await service.pullStack({ friend_id: friendA, size: 1, source: "cli" });
    expect(third.stack).toMatchObject({ stack_no: 2, source: "cli" });

    const open = await service.listStacks({
      friend_id: friendA,
      status: "open",
      limit: 20,
      offset: 0,
    });
    expect(open.map((stack) => stack.id)).toEqual([third.stack.id]);
  });
});

describe("batch log", () => {
  dbTest("writes one action per copy per type under one session", async () => {
    const { stack } = await service.pullStack({ friend_id: friendA, size: 2 });

    const result = await service.logSession({
      friend_id: friendA,
      stack_id: stack.id,
      action_types: ["sleeved", "cleaned"],
      occurred_at: "2026-10-20T19:00:00Z",
      sleeve_type: "poly-rice-paper-poly",
      details: { method: "ultrasonic" },
      notes: "Stack night",
      source: "web",
    });

    expect(result.actions).toHaveLength(4);
    expect(new Set(result.actions.map((action) => action.session_id))).toEqual(new Set([stack.id]));
    expect(result.actions.every((action) => action.source === "web")).toBe(true);
    const sleeved = result.actions.filter((action) => action.action_type === "sleeved");
    expect(sleeved.every((action) => action.details.method === undefined)).toBe(true);
    expect(result.copies).toHaveLength(2);
    expect(result.copies.every((copy) => copy.is_default)).toBe(true);
    expect(
      result.copies.every((copy) => copy.last_cleaned_at === iso("2026-10-20T19:00:00Z")),
    ).toBe(true);
    expect(result.copies.every((copy) => copy.inner_sleeve_type === "poly-rice-paper-poly")).toBe(
      true,
    );
    expect(result.session).toMatchObject({ status: "logged", stack_no: 1 });
    // The stack's items now point at the real default copies.
    expect(result.session.items.map((item) => item.copy_id).sort()).toEqual(
      result.copies.map((copy) => copy.id).sort(),
    );
  });

  dbTest("writes nothing when it fails part-way, not even the default copies", async () => {
    const { stack } = await service.pullStack({ friend_id: friendA, size: 3 });
    const real = recordCareService.logActionInTransaction.bind(recordCareService);
    let calls = 0;
    vi.spyOn(recordCareService, "logActionInTransaction").mockImplementation(
      async (client, input) => {
        if (++calls === 3) throw new Error("disk on fire");
        return real(client, input);
      },
    );

    await expect(
      service.logSession({ friend_id: friendA, stack_id: stack.id, action_types: ["cleaned"] }),
    ).rejects.toThrow("disk on fire");

    const actions = await dbQuery(`SELECT 1 FROM record_actions WHERE friend_id = $1`, [friendA]);
    const copies = await dbQuery(`SELECT 1 FROM record_copies WHERE friend_id = $1`, [friendA]);
    expect(actions.rows).toHaveLength(0);
    expect(copies.rows).toHaveLength(0);
    await expect(service.getStack(stack.id, friendA)).resolves.toMatchObject({ status: "open" });
  });

  dbTest("logs an ad-hoc selection without a stack number", async () => {
    const result = await service.logSession({
      friend_id: friendA,
      copies: [{ release_id: RELEASES[3] }, { release_id: RELEASES[3] }],
      action_types: ["inspected"],
      source: "mcp",
    });
    expect(result.session).toMatchObject({ stack_no: null, status: "logged", source: "mcp" });
    expect(result.session.items).toHaveLength(1);
    expect(result.actions).toHaveLength(1);
  });
});

describe("undo", () => {
  dbTest("voids the session, recomputes from the remaining actions and reopens", async () => {
    // Earlier single actions the undo must fall back to.
    const before = await recordCareService.logAction({
      friend_id: friendA,
      release_id: RELEASES[3],
      action_type: "cleaned",
      occurred_at: "2026-03-01T00:00:00Z",
    });
    await recordCareService.logAction({
      friend_id: friendA,
      release_id: RELEASES[3],
      action_type: "sleeved",
      sleeve_type: "paper",
      occurred_at: "2026-03-01T00:00:00Z",
    });
    expect(before.action.source).toBe("api");

    const { stack } = await service.pullStack({
      friend_id: friendA,
      copies: [{ copy_id: before.copy.id }, { release_id: RELEASES[0] }],
    });
    await service.logSession({
      friend_id: friendA,
      stack_id: stack.id,
      action_types: ["cleaned", "sleeved"],
      sleeve_type: "poly",
      occurred_at: "2026-10-01T00:00:00Z",
    });

    const undone = await service.voidSession(stack.id, friendA);

    expect(undone?.actions).toHaveLength(4);
    expect(undone?.actions.every((action) => action.voided_at !== null)).toBe(true);
    expect(undone?.session).toMatchObject({ status: "open", logged_at: null });
    expect(undone?.session.voided_at).not.toBeNull();
    const byId = new Map(undone!.copies.map((copy) => [copy.id, copy]));
    expect(byId.get(before.copy.id)).toMatchObject({
      last_cleaned_at: iso("2026-03-01T00:00:00Z"),
      inner_sleeve_type: "paper",
    });
    const fresh = undone!.copies.find((copy) => copy.id !== before.copy.id)!;
    expect(fresh).toMatchObject({ last_cleaned_at: null, inner_sleeve_type: null });

    // History is kept, and undoing twice is refused.
    const all = await dbQuery(`SELECT 1 FROM record_actions WHERE session_id = $1`, [stack.id]);
    expect(all.rows).toHaveLength(4);
    await expect(service.voidSession(stack.id, friendA)).rejects.toThrow();

    // The care log shows the undone stack and the single actions.
    const log = await service.listLog({ friend_id: friendA, limit: 20, offset: 0 });
    expect(log.total).toBe(3);
    expect(log.items[0]).toMatchObject({
      kind: "session",
      stack_no: 1,
      action_types: ["cleaned", "sleeved"],
      record_count: 2,
      voided: true,
      sleeve_type: "poly",
    });
    expect(log.items.slice(1).map((entry) => [entry.kind, entry.action_types[0]])).toEqual([
      ["action", "sleeved"],
      ["action", "cleaned"],
    ]);

    // Logged again, it counts only the new actions.
    await service.logSession({
      friend_id: friendA,
      stack_id: stack.id,
      action_types: ["inspected"],
    });
    const relogged = await service.listLog({ friend_id: friendA, limit: 1, offset: 0 });
    expect(relogged.items[0]).toMatchObject({ action_types: ["inspected"], voided: false });
  });

  dbTest("will not reopen a stack beside another open one", async () => {
    const first = await service.pullStack({ friend_id: friendA, size: 1 });
    await service.logSession({
      friend_id: friendA,
      stack_id: first.stack.id,
      action_types: ["inspected"],
    });
    await service.pullStack({ friend_id: friendA, size: 1 });

    await expect(service.voidSession(first.stack.id, friendA)).rejects.toThrow(
      "Another stack is open",
    );
    const live = await dbQuery(
      `SELECT 1 FROM record_actions WHERE session_id = $1 AND voided_at IS NULL`,
      [first.stack.id],
    );
    expect(live.rows).toHaveLength(1);
  });
});
