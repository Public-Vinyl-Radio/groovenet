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

// ─── indexing candidate resolution (#277) ─────────────────────────────────────

// Its own fixtures: the suite above deletes its friends as its final assertions,
// and these queries join tracks, which those tests cascade away.
describe("index candidate resolution (DB integration)", () => {
  const USERNAME_C = "fingerprint-index-test";
  const RELEASE_ID = "fingerprint-index-release";
  const engine = { fingerprint_type: "chromaprint", fingerprint_version: "1" };

  let friendC = 0;

  async function createIndexTrack(
    trackId: string,
    localAudioUrl: string | null,
    releaseId: string | null = RELEASE_ID
  ) {
    await dbQuery(
      `
      INSERT INTO tracks (track_id, username, friend_id, title, artist, local_audio_url, release_id)
      VALUES ($1, $2, $3, 'Test Title', 'Test Artist', $4, $5)
      `,
      [trackId, USERNAME_C, friendC, localAudioUrl, releaseId]
    );
  }

  beforeAll(async () => {
    if (process.env.RUN_DB_TESTS !== "1") return;
    await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME_C]);
    friendC = await createFriend(USERNAME_C);

    await createIndexTrack("idx-indexed", "indexed.m4a");
    await createIndexTrack("idx-missing", "missing.m4a");
    await createIndexTrack("idx-no-audio", null);
    await createIndexTrack("idx-other-release", "other.m4a", "some-other-release");

    // One track already indexed under the active engine, and the same track
    // indexed under a different version — which must not count as covered.
    await repo.upsertFingerprint({
      track_id: "idx-indexed",
      friend_id: friendC,
      ...engine,
      fingerprint_data: Buffer.from([1]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 100,
    });
    await repo.upsertFingerprint({
      track_id: "idx-missing",
      friend_id: friendC,
      fingerprint_type: "chromaprint",
      fingerprint_version: "99",
      fingerprint_data: Buffer.from([2]),
      audio_sha256: SHA_TWO,
      audio_duration_seconds: 100,
    });
  });

  afterAll(async () => {
    if (process.env.RUN_DB_TESTS !== "1") return;
    await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME_C]);
  });

  function ids(rows: Array<{ track_id: string }>): string[] {
    return rows.map((r) => r.track_id).sort();
  }

  dbTest("--missing skips what this engine already covers", async () => {
    const rows = await repo.listIndexCandidates({ kind: "missing" }, engine);
    const mine = rows.filter((r) => r.friend_id === friendC);

    // idx-missing is indexed under version 99, not version 1, so it is still
    // missing for this engine — the version bump case.
    expect(ids(mine)).toEqual(["idx-missing", "idx-other-release"]);
  });

  dbTest("--missing never offers a track without local audio", async () => {
    const rows = await repo.listIndexCandidates({ kind: "missing" }, engine);
    expect(ids(rows)).not.toContain("idx-no-audio");
  });

  dbTest("--changed takes only what this engine already covers", async () => {
    const rows = await repo.listIndexCandidates({ kind: "changed" }, engine);
    const mine = rows.filter((r) => r.friend_id === friendC);

    expect(ids(mine)).toEqual(["idx-indexed"]);
    expect(mine[0].stored_audio_sha256).toBe(SHA_ONE);
  });

  dbTest("--all takes every track with audio", async () => {
    const rows = await repo.listIndexCandidates({ kind: "all" }, engine);
    const mine = rows.filter((r) => r.friend_id === friendC);

    expect(ids(mine)).toEqual(["idx-indexed", "idx-missing", "idx-other-release"]);
  });

  dbTest("carries the stored hash so the worker can decide alone", async () => {
    const rows = await repo.listIndexCandidates({ kind: "all" }, engine);
    const byId = new Map(rows.map((r) => [r.track_id, r]));

    expect(byId.get("idx-indexed")?.stored_audio_sha256).toBe(SHA_ONE);
    // Indexed under another version only, so nothing this engine can reuse.
    expect(byId.get("idx-missing")?.stored_audio_sha256).toBeNull();
  });

  dbTest("round-trips the audio's size and mtime as numbers (#303)", async () => {
    await repo.upsertFingerprint({
      track_id: "idx-indexed",
      friend_id: friendC,
      ...engine,
      fingerprint_data: Buffer.from([1]),
      audio_sha256: SHA_ONE,
      audio_duration_seconds: 100,
      audio_size_bytes: 41_234_567,
      audio_mtime_ms: 1_790_000_000_123,
    });

    const byId = new Map((await repo.listIndexCandidates({ kind: "changed" }, engine)).map((r) => [r.track_id, r]));
    // bigint columns come back from pg as strings unless cast; the worker
    // compares these with its own stat, so they must be exact numbers.
    expect(byId.get("idx-indexed")?.stored_audio_size_bytes).toBe(41_234_567);
    expect(byId.get("idx-indexed")?.stored_audio_mtime_ms).toBe(1_790_000_000_123);
  });

  dbTest("records stats only against the hash they were read from (#303)", async () => {
    const identity = { track_id: "idx-indexed", friend_id: friendC, ...engine };

    expect(
      await repo.recordFileStats({ ...identity, audio_sha256: SHA_TWO, audio_size_bytes: 1, audio_mtime_ms: 2 })
    ).toBe(false);
    expect(
      await repo.recordFileStats({ ...identity, audio_sha256: SHA_ONE, audio_size_bytes: 55, audio_mtime_ms: 66 })
    ).toBe(true);

    const row = await repo.findFingerprint(identity);
    expect(row?.audio_size_bytes).toBe(55);
    expect(row?.audio_mtime_ms).toBe(66);
    // The fingerprint itself is untouched.
    expect(row?.fingerprint_data).toEqual(Buffer.from([1]));
  });

  dbTest("--track narrows to one track", async () => {
    const rows = await repo.listIndexCandidates(
      { kind: "track", track_id: "idx-indexed", friend_id: friendC },
      engine
    );

    expect(ids(rows)).toEqual(["idx-indexed"]);
  });

  dbTest("--release narrows to one release", async () => {
    const rows = await repo.listIndexCandidates(
      { kind: "release", release_id: RELEASE_ID, friend_id: friendC },
      engine
    );

    expect(ids(rows)).toEqual(["idx-indexed", "idx-missing"]);
  });

  dbTest("excludes soft-deleted tracks", async () => {
    await dbQuery(
      `UPDATE tracks SET deleted_at = NOW() WHERE track_id = $1 AND friend_id = $2`,
      ["idx-other-release", friendC]
    );

    const rows = await repo.listIndexCandidates({ kind: "all" }, engine);
    expect(ids(rows)).not.toContain("idx-other-release");

    await dbQuery(
      `UPDATE tracks SET deleted_at = NULL WHERE track_id = $1 AND friend_id = $2`,
      ["idx-other-release", friendC]
    );
  });

  dbTest("counts unindexable tracks rather than failing them", async () => {
    const count = await repo.countUnindexableTracks({
      kind: "release",
      release_id: RELEASE_ID,
      friend_id: friendC,
    });

    expect(count).toBe(1); // idx-no-audio
  });
});
