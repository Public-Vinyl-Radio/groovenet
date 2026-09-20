/**
 * `audio_ingests` against a real Postgres.
 *
 * Exists mostly for `findByFilePaths`, whose `= ANY($1::text[])` binding is the
 * kind of thing a mocked `dbQuery` will happily accept and a real driver will
 * not. The sweeper calls it on every tick, so getting it wrong means retention
 * silently never runs.
 *
 * Needs an empty, migrated Postgres. Run with `just ingest-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbQuery, dbPool } from "@/lib/serverDb";
import { AudioIngestRepository } from "../audioIngestRepository";
import type { AudioIngestStatus } from "../audioIngestRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const repo = new AudioIngestRepository();
const SOURCE_ID = "ingest-retention-test";

async function cleanup() {
  await dbQuery(`DELETE FROM audio_ingests WHERE source_id = $1`, [SOURCE_ID]);
}

async function seed(fileName: string, status: AudioIngestStatus) {
  return repo.create({
    source_id: SOURCE_ID,
    file_path: fileName,
    status,
    received_at: new Date(),
  });
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await seed("processed.wav", "processed");
  await seed("processing.wav", "processing");
  await seed("failed.wav", "failed");
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("findByFilePaths() (DB integration)", () => {
  dbTest("binds a text array and returns the matching records", async () => {
    const rows = await repo.findByFilePaths(["processed.wav", "processing.wav"]);

    expect(rows.map((r) => r.file_path).sort()).toEqual([
      "processed.wav",
      "processing.wav",
    ]);
  });

  dbTest("returns the statuses the sweeper decides on", async () => {
    const rows = await repo.findByFilePaths(["processing.wav"]);

    // The whole in-flight protection turns on this value surviving the round
    // trip as a string the sweeper's Set can match.
    expect(rows[0].status).toBe("processing");
  });

  dbTest("returns nothing for a file with no record", async () => {
    expect(await repo.findByFilePaths(["never-seen.wav"])).toEqual([]);
  });

  dbTest("returns only the asked-for subset", async () => {
    const rows = await repo.findByFilePaths(["failed.wav"]);
    expect(rows).toHaveLength(1);
  });

  dbTest("handles a large batch, as a full volume would produce", async () => {
    const names = Array.from({ length: 500 }, (_, i) => `bulk-${i}.wav`);
    names.push("processed.wav");

    const rows = await repo.findByFilePaths(names);

    expect(rows.map((r) => r.file_path)).toEqual(["processed.wav"]);
  });

  dbTest("does not hit the database for an empty list", async () => {
    expect(await repo.findByFilePaths([])).toEqual([]);
  });
});
