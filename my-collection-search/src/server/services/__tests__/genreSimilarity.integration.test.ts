/**
 * Similar genres (#377) against a real Postgres: album co-occurrence counted
 * per distinct album (not per track), ancestor/descendant exclusion, the
 * minimum-support floor, and idempotent recompute. Run with `just genres-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { createGenre } from "@/server/services/genreAdminService";
import { recomputeGenreSimilarity } from "../genreSimilarityService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "genre-similarity-test";

// Latin (seeded)
//  └─ A "GS Test Cumbia"
//       ├─ C "GS Test Sub Cumbia"
//       └─ D "GS Test Chicha"
//  └─ B "GS Test Salsa"
const NAMES = {
  A: "GS Test Cumbia",
  B: "GS Test Salsa",
  C: "GS Test Sub Cumbia",
  D: "GS Test Chicha",
};

let friendId = 0;
const ids: Record<"Latin" | "A" | "B" | "C" | "D" | "Rock", string> = {
  Latin: "", A: "", B: "", C: "", D: "", Rock: "",
};

// Every album carries 'Latin' as its own Discogs genre, exercising the
// "Discogs styles mapped onto the taxonomy" half of the album genre set,
// alongside direct track_genres links for the rest.
const ALBUMS: Array<{ release: string; linked: string[] }> = [
  { release: "gs-1", linked: ["A", "B"] },
  { release: "gs-2", linked: ["A", "B"] },
  { release: "gs-3", linked: ["A", "B"] },
  { release: "gs-4", linked: ["A"] },
  { release: "gs-5", linked: ["D", "Rock"] },
  { release: "gs-6", linked: ["D"] },
  { release: "gs-7", linked: ["A", "C"] },
  { release: "gs-8", linked: ["A", "C"] },
  { release: "gs-9", linked: ["A", "C"] },
  { release: "gs-10", linked: [] },
];

async function cleanup() {
  await dbQuery("DELETE FROM tracks WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM albums WHERE release_id LIKE 'gs-%'");
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM genres WHERE name = ANY($1)", [Object.values(NAMES)]);
}

async function genreRow(name: string) {
  const { rows } = await dbQuery<{ id: string }>("SELECT id FROM genres WHERE name = $1", [name]);
  return rows[0].id;
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();

  const latinId = await genreRow("Latin");
  ids.Latin = latinId;
  const a = await createGenre(NAMES.A, latinId);
  ids.A = a.id;
  ids.B = (await createGenre(NAMES.B, latinId)).id;
  ids.C = (await createGenre(NAMES.C, a.id)).id;
  ids.D = (await createGenre(NAMES.D, a.id)).id;
  ids.Rock = await genreRow("Rock");

  const { rows } = await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [USERNAME]);
  friendId = rows[0].id;

  for (const album of ALBUMS) {
    await dbQuery(
      `INSERT INTO albums (release_id, friend_id, title, artist, genres, date_added)
       VALUES ($1, $2, $1, 'Artist', ARRAY['Latin'], '2026-01-01')`,
      [album.release, friendId]
    );
    const trackId = `${album.release}-t`;
    await dbQuery(
      `INSERT INTO tracks (track_id, username, friend_id, title, artist, release_id)
       VALUES ($1, $2, $3, $1, 'Artist', $4)`,
      [trackId, USERNAME, friendId, album.release]
    );
    for (const key of album.linked) {
      await dbQuery(
        "INSERT INTO track_genres (track_id, friend_id, genre_id, source) VALUES ($1, $2, $3, 'manual')",
        [trackId, friendId, ids[key as keyof typeof ids]]
      );
    }
  }
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  // Leaves the table empty, like every other integration test's collection,
  // so genrePage.integration.test's "no rows yet" fallback case still holds
  // whatever order the suite runs in.
  await dbQuery("DELETE FROM genre_similarity");
  await dbPool.end();
});

async function pairRow(genreId: string, relatedId: string) {
  const { rows } = await dbQuery<{ score: number; signals: Record<string, unknown> }>(
    "SELECT score, signals FROM genre_similarity WHERE genre_id = $1 AND related_genre_id = $2",
    [genreId, relatedId]
  );
  return rows[0] ?? null;
}

describe("genre similarity (integration)", () => {
  dbTest("recomputes the whole table in one pass", async () => {
    await expect(recomputeGenreSimilarity()).resolves.toMatchObject({ rows: expect.any(Number) });
    const { rows } = await dbQuery("SELECT 1 FROM genre_similarity LIMIT 1");
    expect(rows.length).toBeGreaterThan(0);
  });

  dbTest("scores siblings and folds in their album co-occurrence (#377)", async () => {
    await recomputeGenreSimilarity();
    const row = await pairRow(ids.A, ids.B);

    expect(row).not.toBeNull();
    expect(row!.signals).toMatchObject({ taxonomy: "sibling", shared_albums: 3 });
    expect(row!.signals.npmi).toBeGreaterThan(0);
    // Sibling base alone, plus a positive co-occurrence term.
    expect(row!.score).toBeGreaterThan(1);
  });

  dbTest("scores a direct parent/child pair on taxonomy only, never on their album overlap", async () => {
    await recomputeGenreSimilarity();
    // Read from C's own side: "Latin" has 50 real seeded children tied at
    // the sibling score, which can crowd a 0.5 parent entry out of *Latin's*
    // (or even A's) own top 20 — a top-N truncation, not a scoring bug. C's
    // only siblings are the other custom test genre (D), so its own list is
    // a reliable place to see this pair.
    const row = await pairRow(ids.C, ids.A);

    expect(row).not.toBeNull();
    expect(row!.signals.taxonomy).toBe("parent");
    expect(row!.signals.npmi).toBeUndefined();
    expect(row!.signals.shared_albums).toBeUndefined();
  });

  dbTest("leaves out a non-direct ancestor/descendant pair entirely, however much they overlap", async () => {
    await recomputeGenreSimilarity();
    // Latin and "GS Test Sub Cumbia" (C) are two levels apart and share
    // every album C is on, via Latin's own Discogs genre on every album.
    expect(await pairRow(ids.Latin, ids.C)).toBeNull();
    expect(await pairRow(ids.C, ids.Latin)).toBeNull();
  });

  dbTest("drops a non-taxonomy pair below the minimum support", async () => {
    await recomputeGenreSimilarity();
    // D and Rock share exactly one album: below the default minimum of 3.
    expect(await pairRow(ids.D, ids.Rock)).toBeNull();
  });

  dbTest("scores siblings with no shared albums on taxonomy alone", async () => {
    await recomputeGenreSimilarity();
    const row = await pairRow(ids.C, ids.D);

    expect(row).not.toBeNull();
    expect(row!.signals).toEqual({ taxonomy: "sibling" });
  });

  dbTest("is idempotent: recomputing twice with nothing changed writes back the same rows", async () => {
    await recomputeGenreSimilarity();
    const before = (
      await dbQuery<{ genre_id: string; related_genre_id: string; score: number; signals: Record<string, unknown> }>(
        "SELECT genre_id, related_genre_id, score, signals FROM genre_similarity ORDER BY genre_id, related_genre_id"
      )
    ).rows;

    await recomputeGenreSimilarity();
    const after = (
      await dbQuery<{ genre_id: string; related_genre_id: string; score: number; signals: Record<string, unknown> }>(
        "SELECT genre_id, related_genre_id, score, signals FROM genre_similarity ORDER BY genre_id, related_genre_id"
      )
    ).rows;

    expect(after).toEqual(before);
    expect(after.length).toBeGreaterThan(0);
  });
});
