import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { PlayDetectionRepository } from "../playDetectionRepository";

// Exercises the cardinality and foreign-key behavior that mocked repository
// tests cannot. Run with RUN_DB_TESTS=1 against an empty, migrated database.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const repo = new PlayDetectionRepository();
const sourceId = `play-detection-test-${randomUUID()}`;
const ingestId = randomUUID();
const windowStart = "2026-09-20T12:00:00Z";

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await dbQuery(
    `INSERT INTO audio_ingests (id, source_id, received_at) VALUES ($1, $2, current_timestamp)`,
    [ingestId, sourceId]
  );
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await dbQuery(`DELETE FROM audio_ingests WHERE id = $1`, [ingestId]);
  await dbPool.end();
});

describe("play_detections schema (DB integration)", () => {
  dbTest("retains multiple candidates and a no-match row for one window", async () => {
    await repo.create({
      ingest_id: ingestId, source_id: sourceId, track_id: "candidate-a",
      confidence: 0.91, window_start_at: windowStart,
    });
    await repo.create({
      ingest_id: ingestId, source_id: sourceId, track_id: "candidate-b",
      confidence: 0.72, window_start_at: windowStart,
    });
    await repo.create({ ingest_id: ingestId, source_id: sourceId, window_start_at: windowStart });

    const rows = await repo.listRecentBySource(sourceId, windowStart);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.confidence).sort()).toEqual([0.72, 0.91, null]);
    expect(rows.some((row) => row.track_id === null)).toBe(true);
  });

  dbTest("stores a window's level and returns it from both reads", async () => {
    await repo.create({
      ingest_id: ingestId, source_id: sourceId, track_id: "level-probe",
      confidence: 0.9, window_start_at: windowStart, level_dbfs: -23.4,
    });

    const bySource = (await repo.listRecentBySource(sourceId, windowStart)).find((r) => r.track_id === "level-probe");
    expect(bySource?.level_dbfs).toBeCloseTo(-23.4, 4);

    const recent = (await repo.listRecent({ source_id: sourceId })).find((r) => r.track_id === "level-probe");
    expect(recent?.level_dbfs).toBeCloseTo(-23.4, 4);
  });

  dbTest("deleting an ingest cascades to its detections", async () => {
    await dbQuery(`DELETE FROM audio_ingests WHERE id = $1`, [ingestId]);
    const { rows } = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM play_detections WHERE ingest_id = $1`,
      [ingestId]
    );
    expect(rows[0].count).toBe("0");
  });
});
