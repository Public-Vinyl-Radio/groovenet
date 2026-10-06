/**
 * The genre filter (#375) against a real Postgres: the recursive descendant
 * expansion, `genre_normalize()` from the migration, the uuid[]/text[] binds
 * and the correlated subqueries, through `/api/tracks/search` and album
 * search. A mocked driver accepts any of that. Run with `just genres-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { GET } from "@/app/api/tracks/search/route";
import { GET as GET_FACETS } from "@/app/api/tracks/search/facets/route";
import { AlbumApiService } from "@/server/services/albumApiService";
import { resolveGenreFilter } from "./genreFilter";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "genre-filter-test";
let friendId = 0;

type Fixture = {
  id: string;
  release: string;
  genres: string[];
  styles: string[];
  linked: string[];
  bpm: number | null;
};

// Discogs values are copied onto each track row, as album import does.
const ALBUMS = [
  { release: "gf-salsa-lp", genres: ["Latin"], styles: ["Salsa"] },
  { release: "gf-rock-lp", genres: ["Rock"], styles: ["Punk"] },
  { release: "gf-odd-lp", genres: ["  LATIN "], styles: ["Cumbia"] },
  { release: "gf-jazz-lp", genres: ["Jazz"], styles: ["Bossanova"] },
];
const TRACKS: Fixture[] = [
  // Reconciled to Cumbia on a Salsa album: found by cumbia, never by salsa.
  { id: "gf-1", release: "gf-salsa-lp", genres: ["Latin"], styles: ["Salsa"], linked: ["Cumbia"], bpm: 100 },
  // Not reconciled: falls back to the album's Salsa.
  { id: "gf-2", release: "gf-salsa-lp", genres: ["Latin"], styles: ["Salsa"], linked: [], bpm: 90 },
  // A Salsa track on a Punk album.
  { id: "gf-3", release: "gf-rock-lp", genres: ["Rock"], styles: ["Punk"], linked: ["Salsa"], bpm: 140 },
  // Untidy Discogs spelling, matched through genre_normalize().
  { id: "gf-4", release: "gf-odd-lp", genres: ["  LATIN "], styles: ["Cumbia"], linked: [], bpm: 130 },
  // `Bossanova` is a Latin style and also a seed alias of Jazz > Bossa Nova.
  { id: "gf-5", release: "gf-jazz-lp", genres: ["Jazz"], styles: ["Bossanova"], linked: [], bpm: null },
];

async function cleanup() {
  await dbQuery("DELETE FROM tracks WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM albums WHERE release_id LIKE 'gf-%'");
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
}

async function searchTracks(query: string) {
  const res = await GET(
    new NextRequest(`http://localhost/api/tracks/search?friend_id=${friendId}&limit=50&${query}`)
  );
  const body = await res.json();
  if (res.status !== 200) return { status: res.status, body, ids: [], total: 0 };
  return {
    status: res.status,
    body,
    ids: (body.hits as { track_id: string }[]).map((h) => h.track_id).sort(),
    total: body.estimatedTotalHits as number,
  };
}

/** Facet counts by genre name, for readable assertions. */
async function facets(query = "") {
  const res = await GET_FACETS(
    new NextRequest(`http://localhost/api/tracks/search/facets?friend_id=${friendId}&${query}`)
  );
  expect(res.status).toBe(200);
  const { genres } = (await res.json()) as { genres: { id: string; track_count: number }[] };
  const { rows } = await dbQuery<{ id: string; name: string }>(
    "SELECT id::text, name FROM genres WHERE id = ANY($1::uuid[])",
    [genres.map((g) => g.id)]
  );
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return { genres, byName: Object.fromEntries(genres.map((g) => [names.get(g.id), g.track_count])) };
}

async function searchAlbums(...genres: string[]) {
  const resolution = await resolveGenreFilter(genres);
  const result = await new AlbumApiService().searchAlbums({
    q: "",
    limit: 50,
    offset: 0,
    friendId: String(friendId),
    sort: "title:asc",
    genreFilter: resolution.filter,
  });
  return result.hits.map((hit) => hit.release_id as string).sort();
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1) RETURNING id",
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const album of ALBUMS) {
    await dbQuery(
      `INSERT INTO albums (release_id, friend_id, title, artist, genres, styles)
       VALUES ($1, $2, $1, 'Artist', $3, $4)`,
      [album.release, friendId, album.genres, album.styles]
    );
  }
  for (const t of TRACKS) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, genres, styles, bpm)
       VALUES ($1, $2, $3, $1, 'Artist', $4, $5, $6, $7)`,
      [t.id, USERNAME, friendId, t.release, t.genres, t.styles, t.bpm]
    );
    for (const name of t.linked) {
      await dbQuery(
        `INSERT INTO track_genres (track_id, friend_id, genre_id, source)
         SELECT $1, $2, id, 'manual' FROM genres WHERE name = $3`,
        [t.id, friendId, name]
      );
    }
  }
  // A deleted Salsa track never surfaces, nor makes its album match.
  await dbQuery(
    `INSERT INTO albums (release_id, friend_id, title, artist, genres, styles)
     VALUES ('gf-gone-lp', $1, 'Gone', 'Artist', ARRAY['Rock'], ARRAY['Punk'])`,
    [friendId]
  );
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id, genres, styles, deleted_at)
     VALUES ('gf-gone', $1, $2, 'gf-gone', 'Artist', 'gf-gone-lp', ARRAY['Rock'], ARRAY['Punk'], now())`,
    [USERNAME, friendId]
  );
  await dbQuery(
    `INSERT INTO track_genres (track_id, friend_id, genre_id, source)
     SELECT 'gf-gone', $1, id, 'manual' FROM genres WHERE name = 'Salsa'`,
    [friendId]
  );
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("genre filter (integration)", () => {
  dbTest("genre_normalize() folds spellings the way normalizeGenreName does", async () => {
    const { rows } = await dbQuery<{ key: string }>(
      "SELECT genre_normalize($1) AS key",
      ["  Post‑Punk   Revival "]
    );
    expect(rows[0].key).toBe("post-punk revival");
  });

  dbTest("a parent includes every child genre", async () => {
    // gf-5 too: the seed has `Bossanova` as a Discogs style under Latin.
    const result = await searchTracks("genre=latin");
    expect(result.ids).toEqual(["gf-1", "gf-2", "gf-3", "gf-4", "gf-5"]);
    expect(result.total).toBe(5);
  });

  dbTest("a track's own genres win over its album's Discogs styles", async () => {
    expect((await searchTracks("genre=cumbia")).ids).toEqual(["gf-1", "gf-4"]);
    expect((await searchTracks("genre=salsa")).ids).toEqual(["gf-2", "gf-3"]);
  });

  dbTest("several genres combine with OR, and with the other filters by AND", async () => {
    expect((await searchTracks("genre=cumbia&genre=bossa-nova")).ids).toEqual([
      "gf-1",
      "gf-4",
      "gf-5",
    ]);
    const filtered = await searchTracks("genre=cumbia&bpm_min=120");
    expect(filtered.ids).toEqual(["gf-4"]);
    expect(filtered.total).toBe(1);
  });

  dbTest("resolves names, aliases and ids as well as slugs", async () => {
    expect((await searchTracks("genre=Bossanova")).ids).toEqual(["gf-5"]);
    expect((await searchTracks("genre=Bossa%20Nova")).ids).toEqual(["gf-5"]);
    const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE name = 'Jazz'");
    expect((await searchTracks(`genre=${rows[0].id}`)).ids).toEqual(["gf-5"]);
  });

  dbTest("an unknown genre is a 400 that names it", async () => {
    const result = await searchTracks("genre=cumbia&genre=not-a-genre");
    expect(result.status).toBe(400);
    expect(result.body.unknown).toEqual(["not-a-genre"]);
  });

  dbTest("an album matches on its Discogs values or any live track's genres", async () => {
    // gf-rock-lp only through gf-3's link; gf-gone-lp's only link is on a deleted track.
    expect(await searchAlbums("salsa")).toEqual(["gf-rock-lp", "gf-salsa-lp"]);
    // gf-salsa-lp through gf-1's link; gf-odd-lp through its Cumbia style.
    expect(await searchAlbums("cumbia")).toEqual(["gf-odd-lp", "gf-salsa-lp"]);
    expect(await searchAlbums("latin")).toEqual([
      "gf-jazz-lp",
      "gf-odd-lp",
      "gf-rock-lp",
      "gf-salsa-lp",
    ]);
  });

  dbTest("facets count each track once per genre, ancestors included", async () => {
    const { byName } = await facets();
    // gf-3's own Salsa link hides its album's Rock; the deleted track counts nowhere.
    expect(byName).toEqual({
      Latin: 5,
      Cumbia: 2,
      Salsa: 2,
      Bossanova: 1,
      Jazz: 1,
      "Bossa Nova": 1,
    });
  });

  dbTest("a facet's count is what filtering on that genre returns", async () => {
    for (const query of ["", "bpm_min=120", "q=gf-1"]) {
      const { genres } = await facets(query);
      expect(genres.length).toBeGreaterThan(0);
      for (const genre of genres) {
        const result = await searchTracks(`genre=${genre.id}${query ? `&${query}` : ""}`);
        expect(result.total).toBe(genre.track_count);
      }
    }
  });

  dbTest("facets follow the other filters and ignore genre", async () => {
    expect((await facets("bpm_min=120&genre=jazz")).byName).toEqual({ Latin: 2, Cumbia: 1, Salsa: 1 });
  });
});
