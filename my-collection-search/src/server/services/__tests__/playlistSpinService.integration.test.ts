/** Playlist spin creation and database-enforced idempotency against real Postgres. */
import { afterAll, beforeAll, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { PlaylistSpinService } from "../playlistSpinService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const service = new PlaylistSpinService();
const USERNAME = "playlist-spin-friend";
const PLAYLIST_NAME = "playlist-spin-test";
let friendId = 0;
let playlistId = 0;
let performanceId = 0;

async function cleanup() {
  // Sessions disappear with their friend before their RESTRICTed playlist and
  // performance attribution is removed.
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM playlists WHERE name = $1", [PLAYLIST_NAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendId = (await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1) RETURNING id", [USERNAME]
  )).rows[0].id;
  playlistId = (await dbQuery<{ id: number }>(
    "INSERT INTO playlists (name) VALUES ($1) RETURNING id", [PLAYLIST_NAME]
  )).rows[0].id;
  for (const [trackId, releaseId, duration, position] of [
    ["playlist-spin-a", "playlist-release-a", 180, 0],
    ["playlist-spin-b", "playlist-release-b", 240, 1],
  ] as const) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, album, release_id, duration_seconds)
       VALUES ($1, $2, $3, $1, 'DJ', 'Set', $4, $5)`,
      [trackId, USERNAME, friendId, releaseId, duration]
    );
    await dbQuery(
      "INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, $2, $3, $4)",
      [playlistId, trackId, friendId, position]
    );
  }
  const liveSet = (await dbQuery<{ id: number }>(
    "INSERT INTO live_sets (playlist_id, status) VALUES ($1, 'performed') RETURNING id", [playlistId]
  )).rows[0];
  performanceId = (await dbQuery<{ id: number }>(
    "INSERT INTO live_set_performances (live_set_id, performed_at) VALUES ($1, $2) RETURNING id",
    [liveSet.id, "2026-10-01T20:00:00.000Z"]
  )).rows[0].id;
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

dbTest("creates one spin per entry and a rerun creates none", async () => {
  await expect(service.log(playlistId, { performance_id: performanceId })).resolves.toMatchObject({
    created: 2, skipped: 0,
  });
  await expect(service.log(playlistId, { performance_id: performanceId })).resolves.toMatchObject({
    created: 0, skipped: 2,
  });

  const { rows } = await dbQuery<{
    provenance: string;
    playlist_id: number;
    played_at: Date;
    track_id: string;
  }>(
    `SELECT ss.provenance, ss.playlist_id, ss.played_at, tse.track_id
     FROM spin_sessions ss
     JOIN track_spin_events tse ON tse.session_id = ss.id
     WHERE ss.playlist_id = $1
     ORDER BY ss.playlist_position`,
    [playlistId]
  );
  expect(rows.map((row) => ({
    provenance: row.provenance,
    playlist_id: row.playlist_id,
    played_at: row.played_at.toISOString(),
    track_id: row.track_id,
  }))).toEqual([
    { provenance: "playlist", playlist_id: playlistId, played_at: "2026-10-01T20:00:00.000Z", track_id: "playlist-spin-a" },
    { provenance: "playlist", playlist_id: playlistId, played_at: "2026-10-01T20:03:00.000Z", track_id: "playlist-spin-b" },
  ]);
});
