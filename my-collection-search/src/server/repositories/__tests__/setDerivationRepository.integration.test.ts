/**
 * `set_recordings` / `set_derivations` against a real Postgres (#282).
 *
 * The statements here lean on things a mocked `dbQuery` accepts and a real
 * driver may not: one parameter used as both a column value and in a CASE, a
 * two-array `unnest` join, a jsonb round trip, and EXISTS over
 * `track_fingerprints` for the "is this even indexed" flag.
 *
 * Needs an empty, migrated Postgres. Run with `just set-derivation-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { SetDerivationRepository } from "../setDerivationRepository";
import { SetRecordingRepository } from "../setRecordingRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const derivations = new SetDerivationRepository();
const recordings = new SetRecordingRepository();

const USERNAME = "set-derivation-test";
const SHA = "a".repeat(64);
const ENGINE = { fingerprint_type: "chromaprint", fingerprint_version: "1" };
const KEY = { recording_sha256: SHA, ...ENGINE, window_seconds: 15, step_seconds: 15 };
let friendId = 0;
let playlistId = 0;
let liveSetId = 0;

async function cleanup() {
  await dbQuery(`DELETE FROM set_recordings WHERE sha256 = $1`, [SHA]);
  await dbQuery(
    `DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE name = $1)`,
    [USERNAME]
  );
  await dbQuery(`DELETE FROM playlists WHERE name = $1`, [USERNAME]);
  await dbQuery(
    `DELETE FROM track_fingerprints WHERE friend_id IN (SELECT id FROM friends WHERE username = $1)`,
    [USERNAME]
  );
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

async function track(trackId: string, releaseId: string, title: string, indexed: boolean) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, position)
     VALUES ($1, $2, $3, $4, 'Artist', $5, $6)`,
    [trackId, USERNAME, friendId, title, releaseId, trackId.split("-")[1]]
  );
  if (indexed) {
    await dbQuery(
      `INSERT INTO track_fingerprints
         (track_id, friend_id, fingerprint_type, fingerprint_version, fingerprint_data, audio_sha256)
       VALUES ($1, $2, 'chromaprint', '1', '\\x00'::bytea, 'x')`,
      [trackId, friendId]
    );
  }
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendId = (
    await dbQuery<{ id: number }>(`INSERT INTO friends (username) VALUES ($1) RETURNING id`, [USERNAME])
  ).rows[0].id;
  await track("100-A1", "100", "Planned", true);
  await track("100-A2", "100", "Sibling", false);
  await track("200-B1", "200", "Also planned", false);
  playlistId = (
    await dbQuery<{ id: number }>(`INSERT INTO playlists (name) VALUES ($1) RETURNING id`, [USERNAME])
  ).rows[0].id;
  for (const [position, trackId] of [[1, "200-B1"], [0, "100-A1"]] as const) {
    await dbQuery(
      `INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, $2, $3, $4)`,
      [playlistId, trackId, friendId, position]
    );
  }
  liveSetId = (
    await dbQuery<{ id: number }>(`INSERT INTO live_sets (playlist_id) VALUES ($1) RETURNING id`, [playlistId])
  ).rows[0].id;
  await recordings.create({ sha256: SHA, file_path: `${SHA}.mp3`, size_bytes: 1234, duration_seconds: 60 });
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("set recordings (DB integration)", () => {
  dbTest("a second create of the same sha256 returns the first row", async () => {
    const again = await recordings.create({ sha256: SHA, file_path: "other.wav", size_bytes: 1 });
    expect(again.file_path).toBe(`${SHA}.mp3`);
    expect(Number(again.size_bytes)).toBe(1234);
  });
});

describe("set derivations (DB integration)", () => {
  dbTest("runs the whole lifecycle and round-trips the windows as jsonb", async () => {
    const created = await derivations.create(KEY);
    expect(created.status).toBe("queued");
    expect(await derivations.findReusable(KEY)).toMatchObject({ id: created.id });

    const claimed = await derivations.transitionStatus(created.id, "processing", ["queued"]);
    expect(claimed?.status).toBe("processing");
    expect(claimed?.completed_at).toBeNull();

    const windows = [
      { start_seconds: 0, duration_seconds: 15, candidates: [] },
      {
        start_seconds: 15,
        duration_seconds: 15,
        candidates: [{ track_id: "100-A1", friend_id: friendId, confidence: 0.91, offset_seconds: 14.4 }],
      },
    ];
    const done = await derivations.complete(created.id, {
      status: "processed", error: null, duration_seconds: 30, windows,
    });
    expect(done?.status).toBe("processed");
    expect(done?.completed_at).not.toBeNull();
    expect(done?.windows).toEqual(windows);

    // Terminal: a late duplicate report changes nothing.
    expect(
      await derivations.complete(created.id, { status: "failed", error: "late", duration_seconds: null, windows: [] })
    ).toBeNull();
  });

  dbTest("sets completed_at when a transition is terminal", async () => {
    const created = await derivations.create(KEY);
    const failed = await derivations.transitionStatus(created.id, "failed", ["queued"], "stalled");
    expect(failed?.completed_at).not.toBeNull();
    expect(failed?.error).toBe("stalled");
  });

  dbTest("never hands back a failed run for reuse", async () => {
    const other = { ...KEY, window_seconds: 10 };
    const created = await derivations.create(other);
    await derivations.transitionStatus(created.id, "failed", ["queued"], "boom");
    expect(await derivations.findReusable(other)).toBeNull();
  });

  dbTest("resolves (track_id, friend_id) pairs through the unnest join", async () => {
    const found = await derivations.findTracks([
      { track_id: "100-A1", friend_id: friendId },
      { track_id: "200-B1", friend_id: friendId },
      { track_id: "missing", friend_id: friendId },
    ]);
    expect(found.map((t) => t.track_id).sort()).toEqual(["100-A1", "200-B1"]);
    expect(found.find((t) => t.track_id === "100-A1")).toMatchObject({ release_id: "100", title: "Planned" });
  });

  dbTest("lists a playlist in order, marking what is fingerprinted", async () => {
    const planned = await derivations.listPlannedEntries(playlistId, ENGINE);
    expect(planned.map((p) => [p.index, p.track_id, p.fingerprinted])).toEqual([
      [0, "100-A1", true],
      [1, "200-B1", false],
    ]);
  });

  dbTest("finds unindexed tracks on the given releases", async () => {
    const unindexed = await derivations.listUnindexedOnReleases(["100"], ENGINE);
    expect(unindexed.map((t) => t.track_id)).toEqual(["100-A2"]);
  });

  dbTest("resolves a live set to its playlist and checks playlists exist", async () => {
    expect(await derivations.findPlaylistIdForLiveSet(liveSetId)).toBe(playlistId);
    expect(await derivations.findPlaylistIdForLiveSet(-1)).toBeNull();
    expect(await derivations.playlistExists(playlistId)).toBe(true);
    expect(await derivations.playlistExists(-1)).toBe(false);
  });

  dbTest("attaches a recording to a live set only once", async () => {
    await derivations.attachToLiveSet(liveSetId, `/api/set-recordings/${SHA}`, "set.mp3");
    await derivations.attachToLiveSet(liveSetId, `/api/set-recordings/${SHA}`, "set.mp3");
    const { rows } = await dbQuery(
      `SELECT media_type, filename, position FROM live_set_media WHERE live_set_id = $1`,
      [liveSetId]
    );
    expect(rows).toEqual([{ media_type: "audio", filename: "set.mp3", position: 0 }]);
  });
});
