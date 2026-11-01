import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { SpinSessionRepository } from "../spinSessionRepository";
import { TrackSpinEventRepository } from "../trackSpinEventRepository";
import { recordCareQueueRepository } from "../recordCareQueueRepository";
import {
  recordCareQueueService,
  flattenedRecordCareQueue,
} from "@/server/services/recordCareQueueService";
import { RecordCareSessionService } from "@/server/services/recordCareSessionService";
import { RecordCareService } from "@/server/services/recordCareService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const now = new Date("2026-11-01T06:30:00Z"); // Still October in Los Angeles.
const zone = "America/Los_Angeles";
const username = "care-queue-integration";
let friendId: number;
let cleanedCopy: number;
let extraCopy: number;
const care = new RecordCareService();
async function cleanup() {
  await dbQuery(
    "DELETE FROM albums WHERE friend_id IN (SELECT id FROM friends WHERE username = $1)",
    [username],
  );
  await dbQuery("DELETE FROM friends WHERE username = $1", [username]);
}
async function spin(
  release: string,
  time: string,
  medium: "vinyl" | "digital" = "vinyl",
  owner = friendId,
) {
  const session = await new SpinSessionRepository().createSession(dbPool, {
    friend_id: owner,
    release_id: release,
    played_at: time,
    selection_mode: "tracks",
    medium,
  });
  await new TrackSpinEventRepository().insertEvents(dbPool, session.id, [
    {
      friend_id: owner,
      release_id: release,
      track_id: release,
      played_at: time,
      ordinal: 0,
      title_snapshot: release,
      artist_snapshot: "Artist",
      album_snapshot: release,
    },
  ]);
}
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendId = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      username,
    ])
  ).rows[0].id;
  for (const [release, artist, title, added] of [
    ["queue-spun", "Z", "Spun", "2026-10-20"],
    ["queue-tie-old", "A", "Tie old", "2020-01-01"],
    ["queue-tie-new", "Z", "Tie new", "2020-01-01"],
    ["queue-digital", "A", "Digital", "2026-10-20"],
    ["queue-new-edge", "B", "Arrival edge", "2026-10-02T06:30:00"],
    ["queue-before-month", "C", "Before month", "2020-01-01"],
    ["queue-after-month", "D", "After month", "2020-01-01"],
    ["queue-future-added", "E", "Future import", "2026-11-02"],
    ["queue-voided", "A", "Voided", "2020-01-01"],
    ["queue-copies", "B", "Copies", "2020-01-01"],
    ["queue-deleted", "Z", "Deleted copy", "2020-01-01"],
    ["queue-back-z", "Z", "Back Z", "2020-01-01"],
    ["queue-back-a", "A", "Back A", "2020-01-01"],
  ]) {
    await dbQuery(
      "INSERT INTO albums (release_id, friend_id, title, artist, date_added) VALUES ($1,$2,$3,$4,$5)",
      [release, friendId, title, artist, added],
    );
  }
  // Spun and new => spun; count order wins over last spin and artist.
  await spin("queue-spun", "2026-10-01T07:00:00Z");
  await spin("queue-spun", "2026-10-03T07:00:00Z");
  await spin("queue-tie-old", "2026-10-10T00:00:00Z");
  await spin("queue-tie-new", "2026-10-11T00:00:00Z");
  await spin("queue-spun", "2026-10-20T00:00:00Z", "digital");
  await spin("queue-digital", "2026-10-20T00:00:00Z", "digital");
  await spin("queue-before-month", "2026-10-01T06:59:59Z");
  await spin("queue-after-month", "2026-11-01T07:00:00Z");
  // Ever cleaned, including overdue, never re-enters the queue. Extra copy does.
  const clean = await care.logAction({
    friend_id: friendId,
    release_id: "queue-copies",
    action_type: "cleaned",
    occurred_at: "2020-01-01T00:00:00Z",
  });
  cleanedCopy = clean.copy.id;
  extraCopy = (await care.createCopy({ friend_id: friendId, release_id: "queue-copies" })).id;
  const voided = await care.logAction({
    friend_id: friendId,
    release_id: "queue-voided",
    action_type: "cleaned",
  });
  await care.voidAction(voided.action.id, friendId);
  await care.logAction({
    friend_id: friendId,
    release_id: "queue-voided",
    action_type: "sleeved",
    sleeve_type: "paper",
  });
  const deleted = await care.logAction({
    friend_id: friendId,
    release_id: "queue-deleted",
    action_type: "cleaned",
  });
  await care.deleteCopy(deleted.copy.id, friendId); // Same implicit replacement as summary.
  await dbQuery(
    "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ('queue-gone', $1, 'Gone', 'Artist')",
    [friendId],
  );
  await care.logAction({ friend_id: friendId, release_id: "queue-gone", action_type: "cleaned" });
  await dbQuery("DELETE FROM albums WHERE release_id = 'queue-gone' AND friend_id = $1", [
    friendId,
  ]);
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  vi.unstubAllEnvs();
  await cleanup();
  await dbPool.end();
});
dbTest(
  "groups vinyl spins, import arrivals and never-cleaned backlog once per physical copy",
  async () => {
    const data = await recordCareQueueRepository.queue(friendId, "2026-10", zone, now, null, 0, []);
    const spun = data.items.filter((r) => r.group_name === "spun_recently");
    expect(spun.map((r) => [r.release_id, r.spin_count])).toEqual([
      ["queue-spun", 2],
      ["queue-tie-new", 1],
      ["queue-tie-old", 1],
    ]);
    expect(spun[0].copy_id).toBeNull();
    expect(
      data.items.filter((r) => r.group_name === "new_arrivals").map((r) => r.release_id),
    ).toEqual(["queue-digital", "queue-new-edge"]);
    expect(data.items.find((r) => r.release_id === "queue-new-edge")?.added_at).toBe(
      "2026-10-02T06:30:00+00:00",
    );
    expect(data.items.some((r) => r.copy_id === cleanedCopy)).toBe(false);
    expect(data.items.find((r) => r.release_id === "queue-copies")?.copy_id).toBe(extraCopy);
    expect(data.items.find((r) => r.release_id === "queue-deleted")?.copy_id).toBeNull();
    expect(data.items.find((r) => r.release_id === "queue-voided")?.inner_sleeve_type).toBe(
      "paper",
    );
    expect(data.items.filter((r) => r.group_name === "backlog").map((r) => r.release_id)).toEqual([
      "queue-back-a",
      "queue-voided",
      "queue-copies",
      "queue-before-month",
      "queue-after-month",
      "queue-future-added",
      "queue-back-z",
      "queue-deleted",
    ]);
    expect(new Set(data.items.map((r) => `${r.release_id}/${r.copy_id}`)).size).toBe(
      data.items.length,
    );
    const history = await recordCareQueueRepository.history(friendId, now, zone);
    const summary = await care.careSummary(friendId);
    expect(history).toMatchObject({
      total: summary.total,
      cleaned: 1,
      recent: 0,
      cleaning_days: 0,
      first_recent: null,
    });
    expect(data.items.length + history.cleaned).toBe(summary.total);
  },
);
dbTest(
  "pages backlog A–Z while keeping priority groups and the complete backlog total",
  async () => {
    const page = await recordCareQueueRepository.queue(friendId, "2026-10", zone, now, 2, 1, []);
    expect(page.items.filter((r) => r.group_name === "backlog").map((r) => r.release_id)).toEqual([
      "queue-voided",
      "queue-copies",
    ]);
    expect(page.items.filter((r) => r.group_name !== "backlog")).toHaveLength(5);
    expect(page.backlog_total).toBe(8);
    for (const [limit, offset] of [
      [0, 0],
      [2, 100],
    ]) {
      const empty = await recordCareQueueRepository.queue(
        friendId,
        "2026-10",
        zone,
        now,
        limit,
        offset,
        [],
      );
      expect(empty.items).toHaveLength(5);
      expect(empty.backlog_total).toBe(8);
    }
  },
);
dbTest(
  "exclusion adapter accepts implicit and explicit open-stack refs without excluding siblings",
  async () => {
    const result = await recordCareQueueRepository.queue(friendId, "2026-10", zone, now, null, 0, [
      { copy_id: null, release_id: "queue-spun" },
      { copy_id: extraCopy, release_id: "queue-copies" },
    ]);
    expect(result.items.some((r) => r.release_id === "queue-spun" || r.copy_id === extraCopy)).toBe(
      false,
    );
    expect(result.backlog_total).toBe(7);
  },
);
dbTest(
  "configurable month changes the spins window; flattened function returns every group in order",
  async () => {
    const november = await recordCareQueueRepository.queue(
      friendId,
      "2026-11",
      zone,
      now,
      null,
      0,
      [],
    );
    expect(
      november.items.filter((r) => r.group_name === "spun_recently").map((r) => r.release_id),
    ).toEqual(["queue-after-month"]);
    vi.stubEnv("GROOVENET_TIME_ZONE", zone);
    const flattened = await flattenedRecordCareQueue(friendId, now);
    const queue = await recordCareQueueService.queue({ friend_id: friendId, limit: 500 }, now);
    expect(flattened.map((r) => r.release_id)).toEqual(
      [...queue.spun_recently.items, ...queue.new_arrivals.items, ...queue.backlog.items].map(
        (r) => r.release_id,
      ),
    );
    expect(queue.spun_recently.month).toBe("2026-10");
  },
);

dbTest("counts first cleanings once, excludes voids and old history from pace", async () => {
  await care.logAction({
    friend_id: friendId,
    release_id: "queue-back-a",
    action_type: "cleaned",
    occurred_at: "2026-10-10T12:00:00Z",
  });
  await care.logAction({
    friend_id: friendId,
    release_id: "queue-back-a",
    action_type: "cleaned",
    occurred_at: "2026-10-20T12:00:00Z",
  });
  await care.logAction({
    friend_id: friendId,
    release_id: "queue-back-z",
    action_type: "cleaned",
    occurred_at: "2026-10-20T12:00:00Z",
  });
  const voided = await care.logAction({
    friend_id: friendId,
    release_id: "queue-digital",
    action_type: "cleaned",
    occurred_at: "2026-10-12T12:00:00Z",
  });
  await care.voidAction(voided.action.id, friendId);
  const history = await recordCareQueueRepository.history(friendId, now, zone);
  expect(history).toMatchObject({ cleaned: 3, recent: 2, cleaning_days: 2 });
  vi.stubEnv("GROOVENET_TIME_ZONE", zone);
  expect((await recordCareQueueService.progress({ friend_id: friendId }, now)).pace).toMatchObject({
    stacks_per_week: 0.05,
  });
});

dbTest(
  "a pulled stack uses queue order and excludes implicit refs even after materialization",
  async () => {
    vi.stubEnv("GROOVENET_TIME_ZONE", zone);
    const sessions = new RecordCareSessionService();
    const expected = await flattenedRecordCareQueue(friendId);
    const { stack } = await sessions.pullStack({ friend_id: friendId, size: 2 });
    expect(stack.items.map((i) => [i.release_id, i.copy_id])).toEqual(
      expected.slice(0, 2).map((i) => [i.release_id, i.copy_id]),
    );
    const implicit = await sessions.discardStack(stack.id, friendId);
    expect(implicit?.status).toBe("discarded");
    const selected = await sessions.pullStack({
      friend_id: friendId,
      copies: [{ release_id: "queue-new-edge" }],
    });
    expect(
      (await recordCareQueueService.queue({ friend_id: friendId }, now)).new_arrivals.items.some(
        (i) => i.release_id === "queue-new-edge",
      ),
    ).toBe(false);
    const materialized = await care.logAction({
      friend_id: friendId,
      release_id: "queue-new-edge",
      action_type: "inspected",
    });
    expect(await recordCareQueueRepository.openStackCopies(friendId)).toContainEqual({
      copy_id: materialized.copy.id,
      release_id: "queue-new-edge",
    });
    expect(
      (await recordCareQueueService.queue({ friend_id: friendId }, now)).new_arrivals.items.some(
        (i) => i.release_id === "queue-new-edge",
      ),
    ).toBe(false);
    await sessions.discardStack(selected.stack.id, friendId);
    expect(
      (await recordCareQueueService.queue({ friend_id: friendId }, now)).new_arrivals.items.some(
        (i) => i.release_id === "queue-new-edge",
      ),
    ).toBe(true);
  },
);
dbTest(
  "this_month counts distinct records and sessions by local logged time, excluding undo and duplicate types",
  async () => {
    const sessions = new RecordCareSessionService();
    const logged = await sessions.logSession({
      friend_id: friendId,
      copies: [{ release_id: "queue-new-edge" }, { release_id: "queue-digital" }],
      action_types: ["cleaned", "sleeved"],
      sleeve_type: "poly",
      occurred_at: "2020-01-01T00:00:00Z",
    });
    await dbQuery(
      "UPDATE record_care_sessions SET logged_at = '2026-10-01T07:00:00Z' WHERE id = $1",
      [logged.session.id],
    );
    const outside = await sessions.logSession({
      friend_id: friendId,
      copies: [{ release_id: "queue-spun" }],
      action_types: ["inspected"],
    });
    await dbQuery(
      "UPDATE record_care_sessions SET logged_at = '2026-11-01T07:00:00Z' WHERE id = $1",
      [outside.session.id],
    );
    const undone = await sessions.logSession({
      friend_id: friendId,
      copies: [{ release_id: "queue-voided" }],
      action_types: ["inspected"],
    });
    await dbQuery(
      "UPDATE record_care_sessions SET logged_at = '2026-10-15T07:00:00Z' WHERE id = $1",
      [undone.session.id],
    );
    await sessions.voidSession(undone.session.id, friendId);
    expect(await recordCareQueueRepository.thisMonth(friendId, "2026-10", zone)).toEqual({
      records: 2,
      sessions: 1,
    });
    expect(await recordCareQueueRepository.thisMonth(friendId, "2026-09", zone)).toEqual({
      records: 0,
      sessions: 0,
    });
  },
);
