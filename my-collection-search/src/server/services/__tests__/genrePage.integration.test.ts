/**
 * The genre page (#376) against a real Postgres: its counts, its spin-ordered
 * lists and the friend scoping, over the same genre filter as search. A
 * mocked driver accepts any SQL. Run with `just genres-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { createGenre } from "@/server/services/genreAdminService";
import { getGenrePage } from "../genrePageService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "genre-page-test";
const OTHER_USERNAME = "genre-page-other";
const SUBGENRE = "Genre Page Test Cumbia";
let friendId = 0;
let otherFriendId = 0;

const ALBUMS = [
  { release: "gp-cumbia-lp", genres: ["Latin"], styles: ["Cumbia"] },
  { release: "gp-salsa-lp", genres: ["Latin"], styles: ["Salsa"] },
];
// `plays` are spin events; `added` orders the tracks nobody has played.
const TRACKS = [
  { id: "gp-1", release: "gp-cumbia-lp", linked: ["Cumbia"], plays: 3, added: "2026-01-01" },
  { id: "gp-2", release: "gp-cumbia-lp", linked: ["Cumbia"], plays: 0, added: "2026-03-01" },
  // Unreconciled: in Cumbia through the album's Discogs style.
  { id: "gp-3", release: "gp-cumbia-lp", linked: [], plays: 1, added: "2026-01-01" },
  { id: "gp-4", release: "gp-salsa-lp", linked: ["Salsa"], plays: 5, added: "2026-01-01" },
  // In Cumbia through a subgenre, and enough of its album for the album too (#448).
  { id: "gp-6", release: "gp-salsa-lp", linked: [SUBGENRE], plays: 0, added: "2026-02-01" },
];

async function cleanup() {
  await dbQuery("DELETE FROM tracks WHERE username = ANY($1)", [[USERNAME, OTHER_USERNAME]]);
  await dbQuery("DELETE FROM albums WHERE release_id LIKE 'gp-%'");
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [[USERNAME, OTHER_USERNAME]]);
  await dbQuery("DELETE FROM genres WHERE name = $1", [SUBGENRE]);
}

async function addFriend(username: string): Promise<number> {
  const { rows } = await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [username]);
  return rows[0].id;
}

async function addTrack(id: string, friend: number, username: string, release: string, added: string, linked: string[]) {
  const album = ALBUMS.find((a) => a.release === release)!;
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, genres, styles, date_added)
     VALUES ($1, $2, $3, $1, 'Artist', $4, $5, $6, $7)`,
    [id, username, friend, release, album.genres, album.styles, added]
  );
  await dbQuery(
    `INSERT INTO track_genres (track_id, friend_id, genre_id, source)
     SELECT $1, $2, id, 'manual' FROM genres WHERE name = ANY($3)`,
    [id, friend, linked]
  );
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  // "related" falls back to taxonomy siblings only once the similarity
  // table (#377) has no rows for the genre; another suite's admin mutation
  // can leave rows behind (its own recompute trigger is fire-and-forget), so
  // this test forces the fallback precondition itself rather than relying on
  // incidental emptiness.
  await dbQuery("DELETE FROM genre_similarity");
  const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE name = 'Cumbia'");
  await createGenre(SUBGENRE, rows[0].id);

  friendId = await addFriend(USERNAME);
  for (const album of ALBUMS) {
    await dbQuery(
      `INSERT INTO albums (release_id, friend_id, title, artist, genres, styles, date_added)
       VALUES ($1, $2, $1, 'Artist', $3, $4, '2026-01-01')`,
      [album.release, friendId, album.genres, album.styles]
    );
  }
  for (const track of TRACKS) {
    await addTrack(track.id, friendId, USERNAME, track.release, track.added, track.linked);
    if (track.plays === 0) continue;
    const session = await dbQuery<{ id: number }>(
      `INSERT INTO spin_sessions (friend_id, release_id, selection_mode, played_at)
       VALUES ($1, $2, 'tracks', now()) RETURNING id`,
      [friendId, track.release]
    );
    for (let ordinal = 0; ordinal < track.plays; ordinal++) {
      await dbQuery(
        `INSERT INTO track_spin_events
           (session_id, friend_id, release_id, track_id, played_at, ordinal, title_snapshot, artist_snapshot, album_snapshot)
         VALUES ($1, $2, $3, $4, now(), $5, $4, 'Artist', $3)`,
        [session.rows[0].id, friendId, track.release, track.id, ordinal]
      );
    }
  }

  // Another collection's Cumbia track, which a scoped page must not count.
  otherFriendId = await addFriend(OTHER_USERNAME);
  await addTrack("gp-other", otherFriendId, OTHER_USERNAME, "gp-cumbia-lp", "2026-04-01", ["Cumbia"]);
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("genre page (integration)", () => {
  dbTest("counts direct links, Discogs albums and the whole filter, within one collection", async () => {
    const page = await getGenrePage("cumbia", friendId);

    expect(page?.counts).toEqual({ tracks: 2, albums: 1, tracks_total: 4, albums_total: 2 });
    expect(page?.ancestors.map((a) => a.name)).toEqual(["Latin"]);
    expect(page?.children).toContainEqual(expect.objectContaining({ name: SUBGENRE, track_count: 1 }));
    expect(page?.related).toContainEqual(expect.objectContaining({ name: "Salsa", track_count: 1 }));
  });

  dbTest("lists the most played tracks first, then the newest of the rest", async () => {
    const page = await getGenrePage("cumbia", friendId);

    expect(page?.top_tracks.map((t) => [t.track_id, t.play_count])).toEqual([
      ["gp-1", 3],
      ["gp-3", 1],
      ["gp-2", 0],
      ["gp-6", 0],
    ]);
    // The genre links ride along, as on every other track read.
    expect(page?.top_tracks[0]).toMatchObject({ track_genres: [expect.objectContaining({ slug: "cumbia" })] });
  });

  dbTest("ranks albums by spins of any of their tracks", async () => {
    const page = await getGenrePage("cumbia", friendId);

    expect(page?.top_albums.map((a) => [a.release_id, a.play_count])).toEqual([
      ["gp-salsa-lp", 5],
      ["gp-cumbia-lp", 4],
    ]);
    expect(typeof page?.top_albums[0].date_added).toBe("string");
  });

  dbTest("counts every collection when no friend is given", async () => {
    const page = await getGenrePage("cumbia");
    expect(page?.counts.tracks).toBeGreaterThanOrEqual(3);
    expect(page?.top_tracks.map((t) => t.track_id)).toContain("gp-other");
  });

  dbTest("resolves a subgenre to its own page, under both its ancestors", async () => {
    const { rows } = await dbQuery<{ slug: string }>("SELECT slug FROM genres WHERE name = $1", [SUBGENRE]);
    const page = await getGenrePage(rows[0].slug, friendId);

    expect(page?.ancestors.map((a) => a.name)).toEqual(["Latin", "Cumbia"]);
    expect(page?.genre.source).toBe("custom");
    expect(page?.top_tracks.map((t) => t.track_id)).toEqual(["gp-6"]);
  });
});
