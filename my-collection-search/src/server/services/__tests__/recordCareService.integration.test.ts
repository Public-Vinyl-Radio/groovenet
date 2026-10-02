/**
 * Record copies and care actions, against a real Postgres (#262).
 *
 * What a mocked `dbQuery` cannot tell us: that ON CONFLICT infers the partial
 * unique index, that two first actions on one release agree on one default
 * copy, that the cached care state survives backdated and voided actions and
 * concurrent writes, that the CHECK constraints hold, and that the care
 * views' make_interval / IS DISTINCT FROM parameters type-check. Run with
 * `just record-care-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { RecordCareService } from "../recordCareService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const service = new RecordCareService();

const USERNAME = "record-care-friend";
const RELEASES = {
  race: "record-care-race",
  history: "record-care-history",
  copies: "record-care-copies",
  untouched: "record-care-untouched",
  stale: "record-care-stale",
  gone: "record-care-gone",
};
let friendId = 0;

async function cleanup() {
  // Copies and actions cascade from the friend.
  await dbQuery(`DELETE FROM albums WHERE release_id = ANY($1::text[])`, [
    Object.values(RELEASES),
  ]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

const iso = (value: string) => new Date(value).toISOString();

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const [key, releaseId] of Object.entries(RELEASES)) {
    await dbQuery(
      `INSERT INTO albums (release_id, friend_id, title, artist) VALUES ($1, $2, $3, 'Artist')`,
      [releaseId, friendId, `Album ${key}`]
    );
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("default copies", () => {
  dbTest("concurrent first actions on a release agree on one default copy", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        service.logAction({
          friend_id: friendId,
          release_id: RELEASES.race,
          action_type: "cleaned",
          occurred_at: `2026-0${i + 1}-01T00:00:00Z`,
        })
      )
    );

    const copies = await service.listCopies(friendId, RELEASES.race);
    expect(copies).toHaveLength(1);
    expect(copies[0].is_default).toBe(true);
    expect(new Set(results.map((r) => r.copy.id))).toEqual(new Set([copies[0].id]));
    // Whatever order they committed in, the cache holds the latest cleaning.
    expect(copies[0].last_cleaned_at).toBe(iso("2026-06-01T00:00:00Z"));
  });
});

describe("cached care state", () => {
  dbTest("ignores a backdated action and falls back when the latest is voided", async () => {
    const log = (input: {
      action_type: "cleaned" | "sleeved";
      occurred_at: string;
      sleeve_type?: "paper" | "poly-rice-paper-poly";
    }) => service.logAction({ friend_id: friendId, release_id: RELEASES.history, ...input });

    const latestClean = await log({ action_type: "cleaned", occurred_at: "2026-09-01T00:00:00Z" });
    const latestSleeve = await log({
      action_type: "sleeved",
      occurred_at: "2026-09-01T00:00:00Z",
      sleeve_type: "poly-rice-paper-poly",
    });
    await log({ action_type: "cleaned", occurred_at: "2026-02-01T00:00:00Z" });
    const backdated = await log({
      action_type: "sleeved",
      occurred_at: "2026-02-01T00:00:00Z",
      sleeve_type: "paper",
    });

    expect(backdated.copy.last_cleaned_at).toBe(iso("2026-09-01T00:00:00Z"));
    expect(backdated.copy.inner_sleeve_type).toBe("poly-rice-paper-poly");

    await service.voidAction(latestClean.action.id, friendId);
    const afterVoid = await service.voidAction(latestSleeve.action.id, friendId);
    expect(afterVoid?.copy.last_cleaned_at).toBe(iso("2026-02-01T00:00:00Z"));
    expect(afterVoid?.copy.inner_sleeve_type).toBe("paper");

    // Voiding again is a no-op, and the history keeps every action.
    const again = await service.voidAction(latestSleeve.action.id, friendId);
    expect(again?.action.voided_at).toBe(afterVoid?.action.voided_at);
    const live = await service.listActions({ copy_id: afterVoid!.copy.id, friend_id: friendId });
    const all = await service.listActions({
      copy_id: afterVoid!.copy.id,
      friend_id: friendId,
      include_voided: true,
    });
    expect(live).toHaveLength(2);
    expect(all).toHaveLength(4);
    expect(all!.map((a) => a.occurred_at)).toEqual([
      iso("2026-09-01T00:00:00Z"),
      iso("2026-09-01T00:00:00Z"),
      iso("2026-02-01T00:00:00Z"),
      iso("2026-02-01T00:00:00Z"),
    ]);
  });

  dbTest("the database refuses what the API would never send", async () => {
    const { rows } = await dbQuery<{ id: number }>(
      `SELECT id FROM record_copies WHERE friend_id = $1 AND release_id = $2`,
      [friendId, RELEASES.history]
    );
    const copyId = rows[0].id;
    const insert = (actionType: string, sleeve: string | null) =>
      dbQuery(
        `INSERT INTO record_actions (copy_id, friend_id, action_type, occurred_at, sleeve_type)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [copyId, friendId, actionType, sleeve]
      );

    await expect(insert("sleeved", null)).rejects.toThrow(/record_actions_sleeve_payload_check/);
    await expect(insert("cleaned", "paper")).rejects.toThrow(/record_actions_sleeve_payload_check/);
    await expect(insert("sleeved", "rice-paper")).rejects.toThrow(/record_actions_sleeve_type_check/);
    await expect(insert("played", null)).rejects.toThrow(/record_actions_action_type_check/);
    await expect(
      dbQuery(`UPDATE record_copies SET inner_sleeve_type = 'vinyl' WHERE id = $1`, [copyId])
    ).rejects.toThrow(/record_copies_inner_sleeve_type_check/);
  });
});

describe("copies", () => {
  dbTest("adding a copy means one more; the default goes last; deleting keeps history", async () => {
    // Untouched, the release lists its implicit default copy.
    const [implicit] = await service.listCopies(friendId, RELEASES.copies);
    expect(implicit).toMatchObject({ id: null, is_default: true });

    // Adding a copy makes the implicit one real first: two copies, not one.
    const second = await service.createCopy({
      friend_id: friendId,
      release_id: RELEASES.copies,
      label: "Copy 2",
    });
    expect(second.is_default).toBe(false);
    const listed = await service.listCopies(friendId, RELEASES.copies);
    expect(listed.map((c) => [c.is_default, c.label])).toEqual([
      [true, null],
      [false, "Copy 2"],
    ]);

    // The default is labelled by release, and is the same row.
    const first = await service.updateDefaultCopy(friendId, RELEASES.copies, {
      label: "DJ copy",
    });
    expect(first.id).toBe(listed[0].id);
    expect(first.label).toBe("DJ copy");

    // Release-level actions land on the default, not on the newer copy.
    const logged = await service.logAction({
      friend_id: friendId,
      release_id: RELEASES.copies,
      action_type: "inspected",
    });
    expect(logged.copy.id).toBe(first.id);
    await service.logAction({
      friend_id: friendId,
      copy_id: second.id,
      action_type: "repaired",
      notes: "Flattened",
    });

    await expect(service.deleteCopy(first.id, friendId)).rejects.toThrow(/default copy/);
    const deleted = await service.deleteCopy(second.id, friendId);
    expect(deleted?.deleted_at).not.toBeNull();
    expect(await service.listCopies(friendId, RELEASES.copies)).toHaveLength(1);
    await expect(
      service.logAction({ friend_id: friendId, copy_id: second.id, action_type: "cleaned" })
    ).rejects.toThrow("Record copy not found");
    expect(await service.listActions({ copy_id: second.id, friend_id: friendId })).toHaveLength(1);

    // With the extra gone, the default can go too: the release is back to an
    // implicit copy, and a later action makes a new one.
    await service.deleteCopy(first.id, friendId);
    expect((await service.listCopies(friendId, RELEASES.copies))[0].id).toBeNull();
    const fresh = await service.logAction({
      friend_id: friendId,
      release_id: RELEASES.copies,
      action_type: "inspected",
    });
    expect(fresh.copy.id).not.toBe(first.id);
    expect(fresh.copy.is_default).toBe(true);
  });

  dbTest("another friend cannot see or touch the copies", async () => {
    const [copy] = await service.listCopies(friendId, RELEASES.copies);
    const copyId = copy.id!;
    expect(await service.listActions({ copy_id: copyId, friend_id: friendId + 100000 })).toBeNull();
    expect(await service.updateCopy(copyId, friendId + 100000, { label: "mine" })).toBeNull();
  });
});

describe("care views", () => {
  beforeAll(async () => {
    if (process.env.RUN_DB_TESTS !== "1") return;
    await service.logAction({
      friend_id: friendId,
      release_id: RELEASES.stale,
      action_type: "cleaned",
      occurred_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
    });
    await service.logAction({
      friend_id: friendId,
      release_id: RELEASES.stale,
      action_type: "sleeved",
      sleeve_type: "poly-rice-paper-poly",
    });
    // A copy whose album then leaves the collection: history kept, out of the views.
    await service.logAction({
      friend_id: friendId,
      release_id: RELEASES.gone,
      action_type: "cleaned",
    });
    await dbQuery(`DELETE FROM albums WHERE release_id = $1 AND friend_id = $2`, [
      RELEASES.gone,
      friendId,
    ]);
  });

  const releaseIds = (items: Array<{ release_id: string }>) => items.map((i) => i.release_id);

  dbTest("an album with no copies is its implicit, never-cleaned default copy", async () => {
    const { items } = await service.listCare({
      friend_id: friendId,
      status: "never_cleaned",
      limit: 500,
    });
    const untouched = items.find((item) => item.release_id === RELEASES.untouched);
    expect(untouched).toMatchObject({ copy_id: null, is_default: true, last_cleaned_at: null });
    expect(releaseIds(items)).not.toContain(RELEASES.stale);
  });

  dbTest("overdue honours the window it is given", async () => {
    const year = await service.listCare({ friend_id: friendId, status: "overdue" });
    expect(releaseIds(year.items)).toEqual([RELEASES.stale]);
    const twoYears = await service.listCare({
      friend_id: friendId,
      status: "overdue",
      overdue_days: 730,
    });
    expect(twoYears.items).toEqual([]);
  });

  dbTest("needs_sleeve and sleeve_type filter on the cached sleeve", async () => {
    const needing = await service.listCare({
      friend_id: friendId,
      status: "needs_sleeve",
      limit: 500,
    });
    expect(releaseIds(needing.items)).not.toContain(RELEASES.stale);
    expect(releaseIds(needing.items)).toContain(RELEASES.untouched);
    // history ended up in paper after its voids.
    expect(releaseIds(needing.items)).toContain(RELEASES.history);

    const paper = await service.listCare({ friend_id: friendId, sleeve_type: "paper" });
    expect(releaseIds(paper.items)).toEqual([RELEASES.history]);
    const unknown = await service.listCare({ friend_id: friendId, sleeve_type: "unknown", limit: 500 });
    expect(releaseIds(unknown.items)).toContain(RELEASES.untouched);
  });

  dbTest("deleted albums drop out; totals and summary agree", async () => {
    const all = await service.listCare({ friend_id: friendId, limit: 1, offset: 0 });
    // race, history, copies (one live copy), untouched, stale; gone is excluded.
    expect(all.total).toBe(5);
    expect(all.items).toHaveLength(1);

    const summary = await service.careSummary(friendId);
    expect(summary).toMatchObject({
      total: 5,
      never_cleaned: 2, // copies (inspected only) and untouched
      overdue: 1,
      needs_sleeve: 4,
      overdue_days: 365,
      needs_sleeve_type: "poly-rice-paper-poly",
    });
    expect(summary.by_sleeve_type).toEqual({
      original: 0,
      paper: 1,
      "poly-rice-paper-poly": 1,
      poly: 0,
      unknown: 3,
    });
  });
});
