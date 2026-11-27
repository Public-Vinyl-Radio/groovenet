/**
 * Per-profile ratings against a real Postgres (#1283). Rolls the schema back
 * to before `track_ratings`, seeds ratings the old way (`tracks.star_rating`),
 * migrates up and proves the owner sees exactly what they saw before: the
 * same count, and the same value for every `(track_id, username)`, including
 * ratings on friend collections and a record in two collections with a
 * rating on only one. Then down and up again. Run with `just track-ratings-test`
 * against a throwaway database; it migrates that database.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { viewerRatingSql } from "@/lib/trackFilterSpec";
import { TrackRatingRepository } from "../trackRatingRepository";

const enabled = process.env.RUN_DB_TESTS === "1";
const dbTest = it.skipIf(!enabled);
const PREVIOUS = "1795000000000_household-profiles";
const MINE = "ratings-1283-owner-collection";
const FRIEND = "ratings-1283-friend-collection";
const SAM = "Sam (ratings-1283)";
const repo = new TrackRatingRepository();
const appDir = path.resolve(__dirname, "../../../..");

function migrate(...args: string[]) {
  execFileSync("npm", ["run", "--silent", "migrate", "--", ...args], {
    cwd: appDir,
    env: process.env,
    stdio: "pipe",
  });
}

/** Rolls back every migration from `track_ratings` on. */
async function migrateDownToPrevious() {
  const { rows } = await dbQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM pgmigrations WHERE name > $1",
    [PREVIOUS],
  );
  if (rows[0].n > 0) migrate("down", String(rows[0].n));
}

// [collection, track_id, tracks.star_rating before the migration]
const SEED: [string, string, number | null][] = [
  [MINE, "r1283-a", 5],
  [MINE, "r1283-b", 0],
  [MINE, "r1283-c", 3],
  [MINE, "r1283-n", null],
  [MINE, "r1283-dup", 4],
  [FRIEND, "r1283-dup", 0],
  [MINE, "r1283-dup2", 0],
  [FRIEND, "r1283-dup2", 1],
  [FRIEND, "r1283-f", 2],
];

type Snapshot = Record<string, number>;

/** `(track_id, username)` → rating as the owner sees it, 0 unrated. */
async function before(): Promise<Snapshot> {
  const { rows } = await dbQuery<{ key: string; rating: number }>(
    `SELECT track_id || '|' || username AS key, COALESCE(star_rating, 0) AS rating
     FROM tracks WHERE username IN ($1, $2)`,
    [MINE, FRIEND],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.rating]));
}

async function ownerView(): Promise<Snapshot> {
  const { rows } = await dbQuery<{ key: string; rating: number }>(
    `SELECT t.track_id || '|' || t.username AS key, COALESCE(r.rating, 0)::int AS rating
     FROM tracks t
     LEFT JOIN track_ratings r ON r.track_id = t.track_id AND r.friend_id = t.friend_id
       AND r.user_id = (SELECT id FROM users WHERE is_owner)
     WHERE t.username IN ($1, $2)`,
    [MINE, FRIEND],
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.rating]));
}

async function ratingsBy(name: string) {
  const { rows } = await dbQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM track_ratings r JOIN users u ON u.id = r.user_id
     WHERE u.name = $1`,
    [name],
  );
  return rows[0].n;
}

let friendIds: Record<string, number> = {};
let ownerExisted = false;

async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username IN ($1, $2)", [MINE, FRIEND]);
  await dbQuery("DELETE FROM users WHERE name = $1", [SAM]);
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await migrateDownToPrevious();
  // On a fresh database the app never seeded an owner, so the migration must.
  ownerExisted = (await dbQuery("SELECT 1 FROM users WHERE is_owner")).rows.length > 0;
  const { rows } = await dbQuery<{ id: number; username: string }>(
    "INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id, username",
    [MINE, FRIEND],
  );
  friendIds = Object.fromEntries(rows.map((r) => [r.username, r.id]));
  for (const [username, trackId, rating] of SEED) {
    await dbQuery(
      `INSERT INTO tracks (track_id, title, artist, username, friend_id, star_rating)
       VALUES ($1, $1, 'Artist', $2, $3, $4)`,
      [trackId, username, friendIds[username], rating],
    );
  }
  // A second profile from before the migration: it must start with no ratings.
  await dbQuery("INSERT INTO users (name) VALUES ($1)", [SAM]);
}, 120_000);

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  // Leave the database at the latest schema for the next suite.
  migrate("up");
  if (!ownerExisted) await dbQuery("DELETE FROM users WHERE is_owner AND name = 'Owner'");
  await dbPool.end();
}, 120_000);

describe("track_ratings migration (integration)", () => {
  dbTest(
    "gives every rating to the owner, exactly as before, and no one else any",
    async () => {
      const old = await before();
      const rated = Object.values(old).filter((r) => r > 0).length;
      expect(rated).toBe(5);

      migrate("up", "1");

      const { rows: owners } = await dbQuery<{ name: string }>(
        "SELECT name FROM users WHERE is_owner",
      );
      expect(owners).toHaveLength(1);
      // Created by the migration when missing, named once the app knows the username.
      if (!ownerExisted) expect(owners[0].name).toBe("Owner");
      expect(await ownerView()).toEqual(old);
      expect(await ratingsBy(owners[0].name)).toBeGreaterThanOrEqual(rated);
      expect(await ratingsBy(SAM)).toBe(0);
      // tracks.star_rating stays for a release, unchanged.
      expect(await before()).toEqual(old);
    },
    120_000,
  );

  dbTest(
    "rolls back to the owner's current ratings and re-applies onto an existing owner",
    async () => {
      const ownerId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0]
        .id;
      // Ratings changed after the migration: the rollback must keep them.
      await repo.set(ownerId, { track_id: "r1283-b", friend_id: friendIds[MINE] }, 2);
      await repo.set(ownerId, { track_id: "r1283-a", friend_id: friendIds[MINE] }, 0);
      const current = await ownerView();

      await migrateDownToPrevious();
      expect(await before()).toEqual(current);

      migrate("up", "1");
      expect(await ownerView()).toEqual(current);
      expect((await dbQuery("SELECT 1 FROM users WHERE is_owner")).rows).toHaveLength(1);
      expect(
        (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0].id,
      ).toBe(ownerId);
    },
    120_000,
  );

  dbTest(
    "drops tracks.star_rating, and its rollback restores the owner's ratings",
    async () => {
      const hasColumn = async () =>
        (
          await dbQuery(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'tracks' AND column_name = 'star_rating'`,
          )
        ).rows.length > 0;
      const ownerId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0]
        .id;

      migrate("up");
      expect(await hasColumn()).toBe(false);
      await repo.set(ownerId, { track_id: "r1283-n", friend_id: friendIds[MINE] }, 4);
      await repo.set(ownerId, { track_id: "r1283-f", friend_id: friendIds[FRIEND] }, 0);
      const current = await ownerView();

      migrate("down", "1");
      expect(await hasColumn()).toBe(true);
      expect(await before()).toEqual(current);
      const { rows } = await dbQuery<{ column_default: string }>(
        `SELECT column_default FROM information_schema.columns
         WHERE table_name = 'tracks' AND column_name = 'star_rating'`,
      );
      expect(rows[0].column_default).toBe("0");

      migrate("up");
      expect(await hasColumn()).toBe(false);
      expect(await ownerView()).toEqual(current);

      // Put the two ratings this test changed back for the suites below.
      await repo.set(ownerId, { track_id: "r1283-n", friend_id: friendIds[MINE] }, 0);
      await repo.set(ownerId, { track_id: "r1283-f", friend_id: friendIds[FRIEND] }, 2);
    },
    120_000,
  );
});

describe("track ratings repository (integration)", () => {
  dbTest("keeps each profile's rating apart and reads the others' by name", async () => {
    const ownerId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0]
      .id;
    const samId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE name = $1", [SAM]))
      .rows[0].id;
    const ref = { track_id: "r1283-c", friend_id: friendIds[MINE] };
    await repo.set(samId, ref, 1);
    await repo.set(samId, ref, 4); // upsert, not a second row

    const forOwner = await repo.forTracks([ref], ownerId);
    expect(forOwner.get(`${ref.friend_id}:${ref.track_id}`)).toEqual({
      rating: 3,
      others: [{ user_id: samId, name: SAM, rating: 4 }],
    });
    const forSam = await repo.forTracks([ref], samId);
    expect(forSam.get(`${ref.friend_id}:${ref.track_id}`)).toMatchObject({ rating: 4 });

    // The filter SQL reads the viewer's rating, 0 when unrated.
    const atLeast = async (viewer: string, min: number) =>
      (
        await dbQuery<{ track_id: string }>(
          `SELECT t.track_id FROM tracks t
           WHERE t.username = $3 AND ${viewerRatingSql("t", "$1")} >= $2 ORDER BY 1`,
          [viewer, min, MINE],
        )
      ).rows.map((r) => r.track_id);
    expect(await atLeast(samId, 4)).toEqual(["r1283-c"]);
    expect(await atLeast(ownerId, 3)).toEqual(["r1283-c", "r1283-dup"]);
    expect(await atLeast(samId, 0)).toHaveLength(6);

    await expect(repo.set(samId, ref, 0)).resolves.toBeUndefined();
    expect(await atLeast(samId, 1)).toEqual([]);
  });

  dbTest("refuses a rating outside 1–5 and goes with its track", async () => {
    const ownerId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0]
      .id;
    await expect(
      dbQuery(
        "INSERT INTO track_ratings (user_id, track_id, friend_id, rating) VALUES ($1, $2, $3, 6)",
        [ownerId, "r1283-f", friendIds[FRIEND]],
      ),
    ).rejects.toThrow(/check/i);
    await dbQuery("DELETE FROM tracks WHERE track_id = 'r1283-f'");
    expect(
      (await dbQuery("SELECT 1 FROM track_ratings WHERE track_id = 'r1283-f'")).rows,
    ).toHaveLength(0);
  });
});
