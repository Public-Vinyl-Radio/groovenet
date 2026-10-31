import { coverUrlSql } from "../coverUrlSql";
import { afterAll, beforeAll, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { recordCopyRepository } from "../recordCopyRepository";
import { DEFAULT_TARGET_SLEEVE, defaultOverdueDays } from "@/lib/recordCare";
import { homeRepository } from "../homeRepository";
import { SpinSessionRepository } from "../spinSessionRepository";
import { TrackSpinEventRepository } from "../trackSpinEventRepository";
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const now = new Date("2026-10-31T12:00:00Z");
const start = new Date(now.getTime() - 30 * 86400000);
let friend: number;
let other: number;
let latestDraft: number;
const playlistIds: number[] = [];
let spinSequence = 0;
const names = ["home-integration", "home-integration-other"];
async function cleanup() {
  await dbQuery("DELETE FROM playlists WHERE name LIKE 'home-integration%'");
  await dbQuery(
    "DELETE FROM albums WHERE friend_id IN (SELECT id FROM friends WHERE username = ANY($1))",
    [names],
  );
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [names]);
}
async function spin(release: string, medium: "vinyl" | "digital", events: number, owner = friend) {
  const session = await new SpinSessionRepository().createSession(dbPool, {
    friend_id: owner,
    release_id: release,
    medium,
    selection_mode: "tracks",
    played_at: new Date(now.getTime() - ++spinSequence * 1000),
  });
  await new TrackSpinEventRepository().insertEvents(
    dbPool,
    session.id,
    Array.from({ length: events }, (_, ordinal) => ({
      friend_id: owner,
      release_id: release,
      track_id: release,
      played_at: now,
      ordinal,
      title_snapshot: release,
      artist_snapshot: "Artist",
      album_snapshot: release,
    })),
  );
}
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  [friend, other] = (
    await dbQuery<{ id: number }>(
      "INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id",
      names,
    )
  ).rows.map((r) => r.id);
  const arrivals = [
    ["edge", start],
    ["outside", new Date(start.getTime() - 1)],
    ["future", new Date(now.getTime() + 1)],
    ["now", now],
    ["tie-a", new Date(now.getTime() - 1000)],
    ["tie-b", new Date(now.getTime() - 1000)],
    ["mixed", now],
    ["session", now],
    ["older", new Date(now.getTime() - 2000)],
    ["rated", now],
  ] as const;
  for (const [release, date] of arrivals) {
    await dbQuery(
      "INSERT INTO albums (release_id, friend_id, title, artist, date_added, album_rating) VALUES ($1, $2, $1, 'Artist', $3, $4)",
      [release, friend, date.toISOString(), release === "rated" ? 4 : null],
    );
  }
  await dbQuery(
    "INSERT INTO albums (release_id, friend_id, title, artist, date_added) VALUES ('other', $1, 'Other', 'Artist', $2)",
    [other, now.toISOString()],
  );
  await dbQuery(
    `INSERT INTO record_copies (friend_id, release_id, is_default, last_cleaned_at, deleted_at)
    VALUES ($1, 'edge', true, NOW() - make_interval(days => $3::int + 1), NULL),
      ($1, 'now', true, NOW(), NULL),
      ($1, 'older', true, NOW() - make_interval(days => $3::int + 1), NOW()),
      ($2, 'other', true, NOW() - make_interval(days => $3::int + 1), NULL)`,
    [friend, other, defaultOverdueDays()],
  );
  // Two missing-audio rows, including an empty URL; each analysis field separately missing.
  await dbQuery(
    `INSERT INTO tracks (track_id, friend_id, username, title, artist, local_audio_url, bpm, key, duration_seconds)
    VALUES ('known', $1, $3, 'K', 'A', NULL, '120', 'C', 120),
      ('unknown', $1, $3, 'U', 'A', '', NULL, 'C', NULL),
      ('keyless', $1, $3, 'B', 'A', '/audio/b', '120', NULL, 60),
      ('other', $2, $4, 'O', 'A', NULL, NULL, NULL, 300)`,
    [friend, other, names[0], names[1]],
  );
  await spin("mixed", "vinyl", 2);
  await spin("mixed", "digital", 1);
  await spin("session", "vinyl", 0);
  await spin("session", "digital", 0);
  await spin("now", "vinyl", 4, other); // another friend's plays never affect ordering
  for (let i = 0; i < 7; i++) {
    const id = (
      await dbQuery<{ id: number }>(
        "INSERT INTO playlists (name, created_at) VALUES ($1, $2) RETURNING id",
        [`home-integration-${i}`, new Date(now.getTime() + i * 1000).toISOString()],
      )
    ).rows[0].id;
    playlistIds.push(id);
    if (i !== 6)
      await dbQuery(
        "INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, $2, $3, 0)",
        [id, i === 5 ? "other" : "known", i === 5 ? other : friend],
      );
    if (i < 5) {
      const set = (
        await dbQuery<{ id: number }>(
          "INSERT INTO live_sets (playlist_id, title, status, location_name, updated_at) VALUES ($1, $2, $3, 'Club', $4) RETURNING id",
          [
            id,
            `Set ${i}`,
            i === 3 ? "performed" : i === 4 ? "archived" : "draft",
            new Date(now.getTime() + i * 1000).toISOString(),
          ],
        )
      ).rows[0];
      if (i === 2) latestDraft = set.id;
    }
    if (i === 5)
      await dbQuery("INSERT INTO live_sets (playlist_id, updated_at) VALUES ($1, $2)", [
        id,
        new Date(now.getTime() + 10000),
      ]);
  }
  // A mixed-friend playlist: all entries contribute to duration, ownership uses membership.
  await dbQuery(
    "INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, 'unknown', $2, 1), ($1, 'other', $3, 2)",
    [playlistIds[4], friend, other],
  );
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});
dbTest(
  "bounds arrivals inclusively, counts both media and eventless sessions, and breaks ties stably",
  async () => {
    const result = await homeRepository.arrivals(friend, now);
    expect(result.unrated_count).toBe(7); // eight arrivals, one rated, not just the top five
    expect(result.items.map((r) => [r.release_id, r.play_count])).toEqual([
      ["now", 0],
      ["rated", 0],
      ["tie-a", 0],
      ["tie-b", 0],
      ["older", 0],
    ]);
    // Raise the unplayed records so the lower bound and both played records reach the top five.
    for (const release of ["now", "rated", "tie-a", "tie-b", "older"])
      await spin(release, "vinyl", 5);
    expect(
      (await homeRepository.arrivals(friend, now)).items.map((r) => [r.release_id, r.play_count]),
    ).toEqual([
      ["edge", 0],
      ["session", 2],
      ["mixed", 3],
      ["now", 5],
      ["rated", 5],
    ]);
  },
);
dbTest("counts friend-scoped tracks, albums, member playlists and attention", async () => {
  expect(await homeRepository.counts(friend)).toEqual({ tracks: 3, albums: 10, playlists: 5 });
  expect(await homeRepository.attention(friend)).toEqual({
    missing_audio: 2,
    missing_bpm_or_key: 2,
  });
  expect(
    (await recordCopyRepository.careCounts(friend, defaultOverdueDays(), DEFAULT_TARGET_SLEEVE))
      .overdue,
  ).toBe(1);
  expect(await homeRepository.attention(-1)).toEqual({ missing_audio: 0, missing_bpm_or_key: 0 });
});
dbTest(
  "picks the latest draft and recent member playlists with partial known duration",
  async () => {
    const result = await homeRepository.playlists(friend);
    expect(result.draft_set).toEqual({
      id: latestDraft,
      playlist_id: playlistIds[2],
      title: "Set 2",
      location_name: "Club",
      track_count: 1,
      duration_seconds: 120,
      duration_known_share: 1,
    });
    expect(result.recent.map((r) => r.id)).toEqual([
      playlistIds[4],
      playlistIds[3],
      playlistIds[2],
    ]);
    expect(result.recent[0]).toMatchObject({
      name: "home-integration-4",
      track_count: 3,
      duration_seconds: 420,
      duration_known_share: 2 / 3,
    });
    expect(new Date(result.recent[0].created_at).toISOString()).toBe(
      new Date(now.getTime() + 4000).toISOString(),
    );
    expect(await homeRepository.playlists(-1)).toEqual({ draft_set: null, recent: [] });
    await dbQuery("DELETE FROM playlist_tracks WHERE playlist_id = $1", [playlistIds[0]]);
    // Membership remains on the null-duration entry, and zero known durations are reported as zero.
    await dbQuery(
      "INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, 'unknown', $2, 0)",
      [playlistIds[0], friend],
    );
    await dbQuery("UPDATE live_sets SET updated_at = $2 WHERE playlist_id = $1", [
      playlistIds[0],
      new Date(now.getTime() + 20000),
    ]);
    expect((await homeRepository.playlists(friend)).draft_set).toMatchObject({
      track_count: 1,
      duration_seconds: 0,
      duration_known_share: 0,
    });
  },
);

dbTest(
  "resolves album, legacy track, Discogs and missing covers without crossing owners",
  async () => {
    const { rows } = await dbQuery(`
    WITH albums(release_id, friend_id, audio_file_album_art_url, album_thumbnail) AS (
      VALUES ('chosen', 1, '/chosen.jpg', '/discogs.jpg'),
        ('legacy', 1, '', '/discogs.jpg'), ('discogs', 1, '   ', '/discogs.jpg'),
        ('missing', 1, NULL, NULL)
    ), tracks(id, release_id, friend_id, audio_file_album_art_url) AS (
      VALUES (1, 'legacy', 2, '/wrong-owner.jpg'), (2, 'legacy', 1, '  '),
        (3, 'legacy', 1, '/legacy.jpg'), (4, 'legacy', 1, '/later.jpg'),
        (5, 'chosen', 1, '/track.jpg')
    )
    SELECT a.release_id, ${coverUrlSql("a", true)} AS thumbnail FROM albums a
    ORDER BY a.release_id
  `);
    expect(rows).toEqual([
      { release_id: "chosen", thumbnail: "/chosen.jpg" },
      { release_id: "discogs", thumbnail: "/discogs.jpg" },
      { release_id: "legacy", thumbnail: "/legacy.jpg" },
      { release_id: "missing", thumbnail: null },
    ]);
  },
);
