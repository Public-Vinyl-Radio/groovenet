/**
 * The spin list query, against a real Postgres (#334).
 *
 * `listSessions` LEFT JOINs the album and GROUPs BY the session plus the
 * album columns it selects — a mocked `dbQuery` accepts any GROUP BY, a real
 * one refuses a selected column that isn't grouped. Run with
 * `just spin-sessions-test`.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { SpinSessionRepository } from "../spinSessionRepository";
import { TrackSpinEventRepository } from "../trackSpinEventRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const sessions = new SpinSessionRepository();
const events = new TrackSpinEventRepository();

const USERNAME = "spin-list-friend";
const RELEASE_ID = "spin-list-release";
const GONE_RELEASE_ID = "spin-list-release-gone";
let friendId = 0;

async function cleanup() {
  // spin_sessions, albums and their children cascade from the friend.
  await dbQuery(`DELETE FROM albums WHERE release_id IN ($1, $2)`, [RELEASE_ID, GONE_RELEASE_ID]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();

  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME],
  );
  friendId = rows[0].id;
  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist, album_thumbnail)
     VALUES ($1, $2, 'Algo-Ritmo', 'Mexican Institute Of Sound', 'https://img.example/a.jpg')`,
    [RELEASE_ID, friendId],
  );

  const withAlbum = await sessions.createSession(dbPool, {
    friend_id: friendId,
    release_id: RELEASE_ID,
    selection_mode: "tracks",
    played_at: "2026-09-20T21:30:00.000Z",
  });
  await events.insertEvents(dbPool, withAlbum.id, [
    {
      friend_id: friendId,
      release_id: RELEASE_ID,
      track_id: "t-d1",
      played_at: "2026-09-20T21:30:00.000Z",
      ordinal: 0,
      side_key: "D",
      position_snapshot: "D1",
      title_snapshot: "Bolero",
      artist_snapshot: "Mexican Institute Of Sound",
      album_snapshot: "Algo-Ritmo",
    },
    {
      friend_id: friendId,
      release_id: RELEASE_ID,
      track_id: "t-d2",
      played_at: "2026-09-20T21:30:00.000Z",
      ordinal: 1,
      side_key: "D",
      position_snapshot: "D2",
      title_snapshot: "Tipo Raro",
      artist_snapshot: "Mexican Institute Of Sound",
      album_snapshot: "Algo-Ritmo",
    },
  ]);

  // No albums row: the spin outlived the album.
  await sessions.createSession(dbPool, {
    friend_id: friendId,
    release_id: GONE_RELEASE_ID,
    selection_mode: "tracks",
    played_at: "2026-09-19T21:30:00.000Z",
  });
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

dbTest("lists sessions with their album and event count", async () => {
  const rows = await sessions.listSessions({ friend_id: friendId });

  expect(rows).toHaveLength(2);
  const [recent, older] = rows;

  expect(recent.release_id).toBe(RELEASE_ID);
  expect(recent.track_event_count).toBe(2);
  expect(recent.album_title).toBe("Algo-Ritmo");
  expect(recent.album_artist).toBe("Mexican Institute Of Sound");
  expect(recent.album_thumbnail).toBe("https://img.example/a.jpg");

  expect(older.release_id).toBe(GONE_RELEASE_ID);
  expect(older.track_event_count).toBe(0);
  expect(older.album_title).toBeNull();
  expect(older.album_thumbnail).toBeNull();
});

dbTest("keeps release and track filters working alongside the join", async () => {
  const byRelease = await sessions.listSessions({ friend_id: friendId, release_id: RELEASE_ID });
  expect(byRelease.map((row) => row.release_id)).toEqual([RELEASE_ID]);

  const byTrack = await sessions.listSessions({ friend_id: friendId, track_id: "t-d2" });
  expect(byTrack).toHaveLength(1);
  expect(byTrack[0].track_event_count).toBe(2);
});

dbTest("pages through ties on played_at without skipping or repeating", async () => {
  const pagerName = "spin-list-pager";
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [pagerName]);
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [pagerName],
  );
  const pagerId = rows[0].id;

  try {
    // Three sessions share one instant (with microseconds a JS Date would
    // truncate), and two more sit either side of it. Digital and vinyl mix.
    const tie = "2026-09-10T20:00:00.123456Z";
    const plan = [
      ["2026-09-12T20:00:00Z", "vinyl"],
      [tie, "digital"],
      [tie, "vinyl"],
      [tie, "digital"],
      ["2026-09-08T20:00:00Z", "vinyl"],
    ] as const;
    const created: number[] = [];
    for (const [index, [playedAt, medium]] of plan.entries()) {
      const { rows: inserted } = await dbQuery<{ id: number }>(
        `INSERT INTO spin_sessions (friend_id, release_id, medium, selection_mode, played_at)
         VALUES ($1, $2, $3, 'tracks', $4) RETURNING id`,
        // Digital plays are unique per release and instant, so vary the release.
        [pagerId, `${RELEASE_ID}-${index}`, medium, playedAt],
      );
      created.push(inserted[0].id);
    }
    const expected = [created[0], ...[created[3], created[2], created[1]], created[4]];

    const seen: number[] = [];
    let after: { played_at: string; id: number } | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await sessions.listSessions({ friend_id: pagerId, limit: 2, after });
      seen.push(...page.map((row) => row.id));
      if (page.length < 2) break;
      const last = page[page.length - 1];
      after = { played_at: last.played_at_cursor, id: last.id };
    }
    expect(seen).toEqual(expected);

    // The cursor of a page that ends inside the tie resumes inside it.
    const first = await sessions.listSessions({ friend_id: pagerId, limit: 3 });
    expect(first.map((row) => row.id)).toEqual(expected.slice(0, 3));
    const last = first[2];
    expect(last.played_at_cursor).toBe(tie);
    const rest = await sessions.listSessions({
      friend_id: pagerId,
      after: { played_at: last.played_at_cursor, id: last.id },
    });
    expect(rest.map((row) => row.id)).toEqual(expected.slice(3));

    const vinyl = await sessions.listSessions({ friend_id: pagerId, medium: "vinyl" });
    expect(vinyl.map((row) => row.id)).toEqual([created[0], created[2], created[4]]);
    const digital = await sessions.listSessions({ friend_id: pagerId, medium: "digital" });
    expect(digital.map((row) => row.id)).toEqual([created[3], created[1]]);

    const bounded = await sessions.listSessions({
      friend_id: pagerId,
      from: "2026-09-09T00:00:00Z",
      to: "2026-09-11T00:00:00Z",
      after: { played_at: tie, id: created[3] },
    });
    expect(bounded.map((row) => row.id)).toEqual([created[2], created[1]]);
  } finally {
    await dbQuery(`DELETE FROM friends WHERE username = $1`, [pagerName]);
  }
});
