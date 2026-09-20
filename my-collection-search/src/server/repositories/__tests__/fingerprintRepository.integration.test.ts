import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbQuery, dbPool } from "@/lib/serverDb";
import { FingerprintRepository } from "../fingerprintRepository";

// Exercises the schema itself — the composite key, the coexistence of several
// engines and versions, and the cascades — which a mocked dbQuery cannot.
// Needs an empty, migrated Postgres. Run with `just fingerprint-test`.
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");

const repo = new FingerprintRepository();

const USERNAME_A = "fingerprint-test-a";
const USERNAME_B = "fingerprint-test-b";
const TRACK_ID = "fingerprint-test-track";
const SHA_ONE = "1".repeat(64);
const SHA_TWO = "2".repeat(64);

let friendA = 0;
let friendB = 0;

async function createFriend(username: string): Promise<number> {
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [username]
  );
  return rows[0].id;
}

async function createTrack(trackId: string, friendId: number, username: string) {
  await dbQuery(
    `
    INSERT INTO tracks (track_id, username, friend_id, title, artist)
    VALUES ($1, $2, $3, 'Test Title', 'Test Artist')
    `,
    [trackId, username, friendId]
  );
}

async function cleanup() {
  await dbQuery(`DELETE FROM friends WHERE username = ANY($1::text[])`, [
    [USERNAME_A, USERNAME_B],
  ]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendA = await createFriend(USERNAME_A);
  friendB = await createFriend(USERNAME_B);
  await createTrack(TRACK_ID, friendA, USERNAME_A);
  // Same track_id under a second friend — the compound key must keep them apart.
  await createTrack(TRACK_ID, friendB, USERNAME_B);
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("track_fingerprints schema (DB integration)", () => {
  dbTest("holds a Panako and a Chromaprint fingerprint for one track", async () => {
    await repo.upsertFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([1, 2, 3]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 300,
    });
    await repo.upsertFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "panako",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([4, 5, 6]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 300,
    });

    const versions = await repo.listFingerprintVersionsForTrack(TRACK_ID, friendA);
    expect(versions).toEqual([
      { fingerprint_type: "chromaprint", fingerprint_version: "1" },
      { fingerprint_type: "panako", fingerprint_version: "1" },
    ]);
  });

  dbTest("holds two versions of the same engine side by side", async () => {
    await repo.upsertFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "2",
      fingerprint_data: Buffer.from([7, 8, 9]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 300,
    });

    const v1 = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });
    const v2 = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "2",
    });

    expect(v1?.fingerprint_data).toEqual(Buffer.from([1, 2, 3]));
    expect(v2?.fingerprint_data).toEqual(Buffer.from([7, 8, 9]));
  });

  dbTest("upserting one version leaves the other versions untouched", async () => {
    const before = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "2",
    });

    const updated = await repo.upsertFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([42]),
      audio_sha256: SHA_TWO,
      audio_duration_seconds: 301,
    });

    expect(updated.fingerprint_data).toEqual(Buffer.from([42]));
    expect(updated.audio_sha256).toBe(SHA_TWO);

    const after = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "2",
    });
    expect(after).toEqual(before);

    // Still one row per (type, version), not four.
    const versions = await repo.listFingerprintVersionsForTrack(TRACK_ID, friendA);
    expect(versions).toHaveLength(3);
  });

  dbTest("looks fingerprints up by source audio hash", async () => {
    const byNewHash = await repo.findFingerprintsByAudioSha256(SHA_TWO);
    expect(byNewHash).toHaveLength(1);
    expect(byNewHash[0].fingerprint_version).toBe("1");

    const byOldHash = await repo.findFingerprintsByAudioSha256(SHA_ONE, {
      fingerprint_type: "chromaprint",
    });
    expect(byOldHash).toHaveLength(1);
    expect(byOldHash[0].fingerprint_version).toBe("2");
  });

  dbTest("keeps the same track_id apart under different friends", async () => {
    await repo.upsertFingerprint({
      track_id: TRACK_ID,
      friend_id: friendB,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([99]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 300,
    });

    const a = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendA,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });
    const b = await repo.findFingerprint({
      track_id: TRACK_ID,
      friend_id: friendB,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });

    expect(a?.fingerprint_data).toEqual(Buffer.from([42]));
    expect(b?.fingerprint_data).toEqual(Buffer.from([99]));
  });

  dbTest("deleting a track cascades to its fingerprints only", async () => {
    await dbQuery(`DELETE FROM tracks WHERE track_id = $1 AND friend_id = $2`, [
      TRACK_ID,
      friendB,
    ]);

    expect(await repo.countFingerprints({ friend_id: friendB })).toBe(0);
    expect(await repo.countFingerprints({ friend_id: friendA })).toBe(3);
  });

  dbTest("deleting a friend cascades to their fingerprints", async () => {
    await dbQuery(`DELETE FROM friends WHERE id = $1`, [friendA]);

    expect(await repo.countFingerprints({ friend_id: friendA })).toBe(0);
  });
});
