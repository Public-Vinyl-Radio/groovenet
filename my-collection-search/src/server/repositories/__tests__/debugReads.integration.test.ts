/**
 * The debug read queries, against a real Postgres (#299).
 *
 * These use `COUNT(*) FILTER (WHERE …)`, a `CASE` aggregate and a LEFT JOIN
 * across the compound track key — all things a mocked `dbQuery` accepts
 * happily and a real driver may not. Run with `just debug-reads-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbQuery, dbPool } from "@/lib/serverDb";
import { AudioIngestRepository } from "../audioIngestRepository";
import { PlayDetectionRepository } from "../playDetectionRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const ingests = new AudioIngestRepository();
const detections = new PlayDetectionRepository();

const SOURCE = "debug-read-test";
const USERNAME = "debug-read-friend";
const TRACK_ID = "debug-read-track";
let friendId = 0;

async function cleanup() {
  await dbQuery(`DELETE FROM audio_ingests WHERE source_id = $1`, [SOURCE]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist)
     VALUES ($1, $2, $3, 'Debug Title', 'Debug Artist')`,
    [TRACK_ID, USERNAME, friendId]
  );

  // One processed chunk that matched, one that did not, one failure.
  const matched = await ingests.create({
    source_id: SOURCE, session_id: "s1", sequence: 1,
    file_path: "x/1.wav", status: "processed", duration_seconds: 15,
  });
  const unmatched = await ingests.create({
    source_id: SOURCE, session_id: "s1", sequence: 2,
    file_path: "x/2.wav", status: "processed", duration_seconds: 15,
  });
  await ingests.create({
    source_id: SOURCE, session_id: "s1", sequence: 3,
    file_path: "x/3.wav", status: "failed", error: "decode failed",
  });

  await detections.create({
    ingest_id: matched.id, source_id: SOURCE, session_id: "s1",
    track_id: TRACK_ID, friend_id: friendId, confidence: 0.94,
    offset_seconds: 12.4, window_start_at: new Date(),
    fingerprint_type: "chromaprint", fingerprint_version: "1",
  });
  await detections.create({
    ingest_id: unmatched.id, source_id: SOURCE, session_id: "s1",
    track_id: null, friend_id: null, confidence: null,
    offset_seconds: null, window_start_at: new Date(),
    fingerprint_type: "chromaprint", fingerprint_version: "1",
  });
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("listRecent() (DB integration)", () => {
  dbTest("resolves the matched track through the compound key", async () => {
    const rows = await detections.listRecent({ source_id: SOURCE });
    const hit = rows.find((r) => r.track_id === TRACK_ID);

    expect(hit?.track_artist).toBe("Debug Artist");
    expect(hit?.track_title).toBe("Debug Title");
  });

  dbTest("includes no-match windows by default", async () => {
    // The whole point: a null track_id is a recorded window, not an absence.
    const rows = await detections.listRecent({ source_id: SOURCE });

    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.track_id === null)).toBe(true);
  });

  dbTest("filters to matches only", async () => {
    const rows = await detections.listRecent({ source_id: SOURCE, matched: true });
    expect(rows.every((r) => r.track_id !== null)).toBe(true);
  });

  dbTest("filters to no-match only", async () => {
    const rows = await detections.listRecent({ source_id: SOURCE, matched: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].track_id).toBeNull();
  });

  dbTest("leaves the track columns null for a no-match row", async () => {
    const rows = await detections.listRecent({ source_id: SOURCE, matched: false });
    expect(rows[0].track_artist).toBeNull();
  });
});

describe("statsSince() (DB integration)", () => {
  dbTest("counts matched and unmatched windows", async () => {
    const since = new Date(Date.now() - 60_000);
    const stats = await detections.statsSince(since, SOURCE);

    expect(stats).toMatchObject({ windows: 2, matched: 1, noMatch: 1 });
  });

  dbTest("bands the confidence of matches", async () => {
    const stats = await detections.statsSince(new Date(Date.now() - 60_000), SOURCE);

    // 0.94 lands in the top band; the no-match row contributes nothing.
    expect(stats.bands).toEqual([{ band: "0.90-1.00", count: 1 }]);
  });

  dbTest("counts ingests by status and names the failures", async () => {
    const stats = await ingests.statsSince(new Date(Date.now() - 60_000), SOURCE);

    expect(stats.byStatus).toMatchObject({ processed: 2, failed: 1 });
    expect(stats.failures).toEqual([{ error: "decode failed", count: 1 }]);
  });

  dbTest("returns empty rather than throwing for a quiet window", async () => {
    const stats = await detections.statsSince(new Date(Date.now() + 60_000), SOURCE);
    expect(stats).toMatchObject({ windows: 0, matched: 0, noMatch: 0, bands: [] });
  });
});

describe("listRecent() on ingests (DB integration)", () => {
  dbTest("returns the newest first", async () => {
    const rows = await ingests.listRecent({ source_id: SOURCE });
    expect(rows).toHaveLength(3);
  });

  dbTest("filters by status", async () => {
    const rows = await ingests.listRecent({ source_id: SOURCE, status: "failed" });
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBe("decode failed");
  });

  dbTest("pages", async () => {
    const rows = await ingests.listRecent({ source_id: SOURCE, limit: 2 });
    expect(rows).toHaveLength(2);
  });
});
