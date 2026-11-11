/**
 * ISRC backfill (#1156) against a real Postgres.
 *
 * What a mocked `dbQuery` cannot prove: the migration's CHECK on the stored
 * format, the `unnest` batch UPDATE (including a NULL ISRC, which must still
 * stamp `isrc_checked_at`), and that a second run does no work. Apple is a stub;
 * Redis is a counter map. Run with `just backfill-test`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const counters = vi.hoisted(() => new Map<string, Record<string, string>>());
vi.mock("@/lib/redis", () => {
  const pipeline = () => {
    const api = {
      hincrby: (k: string, f: string, n: number) => {
        const h = counters.get(k) ?? {};
        h[f] = String(parseInt(h[f] ?? "0", 10) + n);
        counters.set(k, h);
        return api;
      },
      hset: (k: string, f: string | Record<string, string>, v?: string) => {
        counters.set(k, {
          ...(counters.get(k) ?? {}),
          ...(typeof f === "string" ? { [f]: v! } : f),
        });
        return api;
      },
      rpush: () => api,
      ltrim: () => api,
      expire: () => api,
      exec: async () => [],
    };
    return api;
  };
  return {
    getRedisConnection: () => ({
      multi: pipeline,
      pipeline,
      hgetall: async (k: string) => counters.get(k) ?? {},
      lrange: async () => [],
    }),
  };
});

const apple = vi.hoisted(() => ({ fetchIsrcs: vi.fn(), assertConfigured: vi.fn() }));
vi.mock("@/server/services/appleMusicCatalogService", () => ({ appleMusicCatalogService: apple }));

import { dbPool, dbQuery } from "@/lib/serverDb";
import { trackRepository } from "@/server/repositories/trackRepository";
import { IsrcService } from "../isrcService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "isrc-friend";
let friendId = 0;

const link = (songId: string) => `https://music.apple.com/us/album/x/1?i=${songId}`;

async function insertTrack(trackId: string, appleMusicUrl: string | null) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, apple_music_url)
     VALUES ($1, $2, $3, 't', 'a', $4)`,
    [trackId, USERNAME, friendId, appleMusicUrl],
  );
}

const row = async (trackId: string) =>
  (
    await dbQuery(`SELECT * FROM tracks WHERE track_id = $1 AND friend_id = $2`, [
      trackId,
      friendId,
    ])
  ).rows[0];

async function cleanup() {
  await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]);
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
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS === "1") await cleanup();
  await dbPool.end();
});

describe("ISRC (real Postgres)", () => {
  dbTest("the column only accepts the normalised format", async () => {
    await insertTrack("fmt", null);
    for (const bad of ["usab11800123", "USAB1-1800123", "USAB1180012"]) {
      await expect(
        dbQuery(`UPDATE tracks SET isrc = $1 WHERE track_id = 'fmt' AND friend_id = $2`, [
          bad,
          friendId,
        ]),
      ).rejects.toThrow(/check/i);
    }
    await dbQuery(`UPDATE tracks SET isrc = 'USAB11800123' WHERE track_id = 'fmt'`);
    expect((await row("fmt")).isrc).toBe("USAB11800123");
  });

  dbTest(
    "saveIsrcs stamps every row, including those with no ISRC; clearIsrc undoes it",
    async () => {
      await insertTrack("s1", link("1"));
      await insertTrack("s2", link("2"));
      await trackRepository.saveIsrcs([
        { track_id: "s1", friend_id: friendId, isrc: "USAB11800001" },
        { track_id: "s2", friend_id: friendId, isrc: null },
      ]);
      expect(await row("s1")).toMatchObject({ isrc: "USAB11800001" });
      expect((await row("s1")).isrc_checked_at).toBeInstanceOf(Date);
      expect((await row("s2")).isrc).toBeNull();
      expect((await row("s2")).isrc_checked_at).toBeInstanceOf(Date);

      await trackRepository.clearIsrc("s1", friendId);
      expect(await row("s1")).toMatchObject({ isrc: null, isrc_checked_at: null });
    },
  );

  dbTest("updateTrackFields stores a supplied ISRC", async () => {
    await insertTrack("u1", null);
    await trackRepository.updateTrackFields({
      track_id: "u1",
      friend_id: friendId,
      isrc: "GBXYZ2000001",
    });
    expect((await row("u1")).isrc).toBe("GBXYZ2000001");
  });

  dbTest("the backfill fills tracks with a link, reports the rest, and is idempotent", async () => {
    await dbQuery(`DELETE FROM tracks WHERE username = $1`, [USERNAME]); // only this test's tracks in scope
    await insertTrack("b1", link("101"));
    await insertTrack("b2", link("102"));
    await insertTrack("b3", link("103")); // Apple has no ISRC for this one
    await insertTrack("b4", null);
    await insertTrack("b5", "https://music.apple.com/us/album/x/5"); // names no song
    apple.fetchIsrcs.mockImplementation(async (ids: string[]) => {
      return new Map(ids.map((id) => [id, id === "103" ? null : `USAB1${id.padStart(7, "0")}`]));
    });

    const service = new IsrcService();
    const run = async (request = {}) => {
      const started = await service.start({ friend_id: friendId, ...request });
      await vi.waitFor(async () =>
        expect((await service.getRun(started.run_id))?.complete).toBe(true),
      );
      return (await service.getRun(started.run_id))!;
    };

    const dry = await run({ dry_run: true });
    expect(dry).toMatchObject({ filled: 2, not_found: 1, dry_run: true });
    expect((await row("b1")).isrc).toBeNull();

    const first = await run();
    expect(first).toMatchObject({ filled: 2, not_found: 1, no_link: 2, skipped: 0 });
    expect((await row("b1")).isrc).toBe("USAB10000101");
    expect((await row("b3")).isrc).toBeNull();
    expect((await row("b3")).isrc_checked_at).toBeInstanceOf(Date);

    apple.fetchIsrcs.mockClear();
    const second = await run();
    expect(second).toMatchObject({ filled: 0, skipped: 3, no_link: 2 });
    expect(apple.fetchIsrcs).not.toHaveBeenCalled();

    expect((await run({ force: true })).filled).toBe(2);
  });
});
