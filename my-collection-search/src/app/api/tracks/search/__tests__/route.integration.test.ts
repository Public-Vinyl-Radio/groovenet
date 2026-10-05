/**
 * Lexical `/api/tracks/search` filters (#412) against a real Postgres: the
 * BPM, key and rating clauses in the data query and its count. A mocked
 * driver accepts any SQL. Run with `just embedding-versions-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { GET } from "../route";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "search-filters-friend";
let friendId = 0;

const TRACKS = [
  { id: "deep-1", bpm: 120, key: "A minor", rating: 5 },
  { id: "deep-2", bpm: 124.5, key: "a minor", rating: 3 },
  { id: "deep-3", bpm: 128, key: "C major", rating: 0 },
  { id: "deep-4", bpm: null, key: null, rating: 4 },
];

async function cleanup() {
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
  await dbQuery(`DELETE FROM friends WHERE username = $1`, [USERNAME]);
}

async function search(query: string) {
  const res = await GET(
    new NextRequest(`http://localhost/api/tracks/search?friend_id=${friendId}&${query}`)
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return {
    ids: (body.hits as { track_id: string }[]).map((h) => h.track_id).sort(),
    total: body.estimatedTotalHits as number,
  };
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    `INSERT INTO friends (username) VALUES ($1) RETURNING id`,
    [USERNAME]
  );
  friendId = rows[0].id;
  for (const t of TRACKS) {
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, bpm, key, star_rating)
       VALUES ($1, $2, $3, 'Deep Groove', 'Filter Artist', $4, $5, $6)`,
      [t.id, USERNAME, friendId, t.bpm, t.key, t.rating]
    );
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("lexical search filters (integration)", () => {
  dbTest("BPM bounds are inclusive and decimals work, in hits and total", async () => {
    expect(await search("q=deep&bpm_min=120&bpm_max=124.5")).toEqual({ ids: ["deep-1", "deep-2"], total: 2 });
  });

  dbTest("key is exact but case-insensitive", async () => {
    expect((await search("key=A%20MINOR")).ids).toEqual(["deep-1", "deep-2"]);
  });

  dbTest("star_rating is a minimum", async () => {
    expect((await search("star_rating=4")).ids).toEqual(["deep-1", "deep-4"]);
  });

  dbTest("filters combine with each other and the query", async () => {
    expect(await search("q=groove&bpm_min=121&key=a%20minor&star_rating=3")).toEqual({ ids: ["deep-2"], total: 1 });
  });
});
