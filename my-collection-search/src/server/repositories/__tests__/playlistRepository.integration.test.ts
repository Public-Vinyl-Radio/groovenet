/**
 * The playlist list's batched cover and set-media queries, against a real
 * Postgres (#771). Both use window / FILTER aggregates a mocked `dbQuery`
 * would accept regardless of validity. Run with `just spin-sessions-test`.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { dbQuery } from "@/lib/serverDb";
import { TrackRepository } from "../trackRepository";
import { PlaylistRepository } from "../playlistRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const repo = new PlaylistRepository();

const USERNAME = "playlist-list-friend";
const NAMES = ["playlist-list-covers", "playlist-list-set", "playlist-list-empty"];
let friendId = 0;
const ids: Record<string, number> = {};

async function cleanup() {
  // playlist_tracks and live_sets cascade from the playlist; tracks from the friend.
  await dbQuery(`DELETE FROM playlists WHERE name = ANY($1)`, [NAMES]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendId = (
    await dbQuery<{ id: number }>(`INSERT INTO friends (username) VALUES ($1) RETURNING id`, [
      USERNAME,
    ])
  ).rows[0].id;
  for (const name of NAMES) {
    ids[name] = (
      await dbQuery<{ id: number }>(`INSERT INTO playlists (name) VALUES ($1) RETURNING id`, [name])
    ).rows[0].id;
  }

  // Six tracks, the second without art; inserted out of position order.
  const thumbs: Array<string | null> = ["a", null, "c", "d", "e", "f"];
  for (const [i, thumb] of thumbs.entries()) {
    await dbQuery(
      `INSERT INTO tracks (track_id, friend_id, title, artist, username, album_thumbnail) VALUES ($1, $2, 't', 'a', $4, $3)`,
      [`plist-t${i}`, friendId, thumb ? `/${thumb}.jpg` : null, USERNAME],
    );
  }
  await dbQuery(
    `UPDATE tracks SET audio_file_album_art_url = CASE track_id
    WHEN 'plist-t0' THEN '/chosen.jpg' WHEN 'plist-t1' THEN '/chosen-only.jpg'
    WHEN 'plist-t2' THEN '' ELSE '   ' END WHERE friend_id = $1`,
    [friendId],
  );
  for (const i of [5, 3, 1, 0, 4, 2]) {
    await dbQuery(
      `INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, $2, $3, $4)`,
      [ids["playlist-list-covers"], `plist-t${i}`, friendId, i],
    );
  }

  const setId = (
    await dbQuery<{ id: number }>(`INSERT INTO live_sets (playlist_id) VALUES ($1) RETURNING id`, [
      ids["playlist-list-set"],
    ])
  ).rows[0].id;
  const media: Array<[string, string, number]> = [
    ["flyer", "/flyer-2.jpg", 1],
    ["flyer", "/flyer-1.jpg", 0],
    ["audio", "https://example.com/rec.mp3", 0],
    ["youtube", "https://youtu.be/x", 0],
  ];
  for (const [type, url, position] of media) {
    await dbQuery(
      `INSERT INTO live_set_media (live_set_id, media_type, url, position) VALUES ($1, $2, $3, $4)`,
      [setId, type, url, position],
    );
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
});

dbTest(
  "returns the first four covers with art in position order, one query for all playlists",
  async () => {
    const covers = await repo.listCoverUrlsByPlaylistIds(Object.values(ids));
    expect(covers[ids["playlist-list-covers"]]).toEqual([
      "/chosen.jpg",
      "/chosen-only.jpg",
      "/c.jpg",
      "/d.jpg",
    ]);
    expect(covers[ids["playlist-list-empty"]]).toBeUndefined();
  },
);

dbTest("returns the first media of each type, null for types the set lacks", async () => {
  const sets = await repo.listLiveSetSummariesByPlaylistIds(Object.values(ids));
  expect(sets[ids["playlist-list-set"]]).toMatchObject({
    flyer_url: "/flyer-1.jpg",
    recording_url: "https://example.com/rec.mp3",
    youtube_url: "https://youtu.be/x",
    post_url: null,
  });
  expect(sets[ids["playlist-list-covers"]]).toBeUndefined();
});

dbTest("playlist track reads carry chosen art alongside the raw Discogs thumbnail", async () => {
  const tracks = await new TrackRepository().findTracksByRefsPreservingOrder([
    { track_id: "plist-t0", friend_id: friendId },
    { track_id: "plist-t1", friend_id: friendId },
  ]);
  expect(tracks).toMatchObject([
    { audio_file_album_art_url: "/chosen.jpg", album_thumbnail: "/a.jpg" },
    { audio_file_album_art_url: "/chosen-only.jpg", album_thumbnail: null },
  ]);
});
