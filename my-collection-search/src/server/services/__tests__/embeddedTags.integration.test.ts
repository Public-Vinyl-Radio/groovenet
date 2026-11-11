/**
 * Embedded tags (#673) against a real Postgres and real ffmpeg-made files.
 *
 * What a mocked `dbQuery` cannot prove: the migration's foreign key and CHECK,
 * the `ON CONFLICT ... WHERE source = 'embedded'` guard that protects a user's
 * lyrics, the composer fill-only-when-empty rule, the text[] genre column kept
 * apart from `local_tags`, the backfill's candidate query, and which rows the
 * composer UPDATE actually filled (#1169). Redis is a counter map and the
 * embedding queue a spy. Run with `just backfill-test`.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
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
      hincrby: async (k: string, f: string, n: number) => pipeline().hincrby(k, f, n),
      hgetall: async (k: string) => counters.get(k) ?? {},
      lrange: async () => [],
    }),
  };
});

const enqueue = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue },
}));

import { dbPool, dbQuery } from "@/lib/serverDb";
import { trackRepository } from "@/server/repositories/trackRepository";
import { trackLyricsRepository } from "@/server/repositories/trackLyricsRepository";
import { EmbeddedTagsBackfillService } from "../embeddedTagsBackfillService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "embedded-tags-friend";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "embedded-tags-"));
let friendId = 0;

function makeAudio(name: string, metadata: string[] = []) {
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=duration=1",
      ...metadata,
      path.join(dir, name),
    ],
    { stdio: "ignore" },
  );
}

const tag = (key: string, value: string) => ["-metadata", `${key}=${value}`];

async function insertTrack(trackId: string, file: string | null, composer: string | null = null) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, local_audio_url, composer, local_tags)
     VALUES ($1, $2, $3, 't', 'a', $4, $5, 'dj tag')`,
    [trackId, USERNAME, friendId, file, composer],
  );
}

const row = async (trackId: string) =>
  (
    await dbQuery(`SELECT * FROM tracks WHERE track_id = $1 AND friend_id = $2`, [
      trackId,
      friendId,
    ])
  ).rows[0];
const lyricsRow = async (trackId: string) =>
  (
    await dbQuery(`SELECT * FROM track_lyrics WHERE track_id = $1 AND friend_id = $2`, [
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
  process.env.AUDIO_DIR = dir;
  await cleanup();
  friendId = (
    await dbQuery<{ id: number }>(`INSERT INTO friends (username) VALUES ($1) RETURNING id`, [
      USERNAME,
    ])
  ).rows[0].id;
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS === "1") await cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
  await dbPool.end();
});

describe("embedded tags (real Postgres)", () => {
  dbTest("stores genre apart from local_tags and lyrics in the side table", async () => {
    await insertTrack("a", null);
    expect(
      await trackRepository.saveEmbeddedTags("a", friendId, {
        composer: "A, B",
        genres: ["Música tropical"],
        lyrics: "la la",
      }),
    ).toEqual({ composerFilledFor: [friendId] });
    // Filled once: the second read keeps the composer, so it reports nothing.
    expect(
      await trackRepository.saveEmbeddedTags("a", friendId, {
        composer: "A, B",
        genres: ["Música tropical"],
        lyrics: "la la",
      }),
    ).toEqual({ composerFilledFor: [] });
    const track = await row("a");
    expect(track).toMatchObject({
      composer: "A, B",
      audio_file_genre: ["Música tropical"],
      local_tags: "dj tag",
    });
    expect(track.embedded_tags_read_at).toBeInstanceOf(Date);
    expect(track).not.toHaveProperty("lyrics");
    expect(await lyricsRow("a")).toMatchObject({ lyrics: "la la", source: "embedded" });
  });

  dbTest("never overwrites an existing composer or a user's lyrics", async () => {
    await insertTrack("b", null, "Kept Composer");
    await dbQuery(
      `INSERT INTO track_lyrics (track_id, friend_id, lyrics, source) VALUES ('b', $1, 'mine', 'user')`,
      [friendId],
    );
    expect(
      await trackRepository.saveEmbeddedTags("b", friendId, {
        composer: "From File",
        genres: [],
        lyrics: "from file",
      }),
    ).toEqual({ composerFilledFor: [] });
    await trackRepository.saveEmbeddedTags("b", friendId, {
      composer: null,
      genres: [],
      lyrics: null,
    });
    expect((await row("b")).composer).toBe("Kept Composer");
    expect(await lyricsRow("b")).toMatchObject({ lyrics: "mine", source: "user" });
  });

  dbTest("refreshes embedded lyrics and removes them when the tag disappears", async () => {
    await insertTrack("c", null);
    const tags = { composer: null, genres: [], lyrics: "v1" };
    await trackRepository.saveEmbeddedTags("c", friendId, tags);
    await trackRepository.saveEmbeddedTags("c", friendId, { ...tags, lyrics: "v2" });
    expect((await lyricsRow("c")).lyrics).toBe("v2");
    await trackRepository.saveEmbeddedTags("c", friendId, { ...tags, lyrics: null });
    expect(await lyricsRow("c")).toBeUndefined();
    expect((await row("c")).audio_file_genre).toBeNull();
  });

  dbTest("lyrics go with their track (cascade)", async () => {
    await insertTrack("d", null);
    await trackRepository.saveEmbeddedTags("d", friendId, {
      composer: null,
      genres: [],
      lyrics: "gone soon",
    });
    await dbQuery(`DELETE FROM tracks WHERE track_id = 'd' AND friend_id = $1`, [friendId]);
    expect(await lyricsRow("d")).toBeUndefined();
  });

  dbTest(
    "the backfill reads m4a and ID3 files, tolerates untagged ones, and is idempotent",
    async () => {
      makeAudio("m.m4a", [
        ...tag("composer", "Camilo & Eblis"),
        ...tag("genre", "Música tropical"),
        ...tag("lyrics", "words"),
      ]);
      makeAudio("i.mp3", [...tag("composer", "X;Y"), ...tag("genre", "House")]);
      makeAudio("bare.flac");
      await insertTrack("m", "m.m4a");
      await insertTrack("i", "i.mp3");
      await insertTrack("bare", "bare.flac");
      await insertTrack("gone", "gone.m4a");

      const service = new EmbeddedTagsBackfillService();
      const run = async (force = false) => {
        const started = await service.start({ friend_id: friendId, force });
        await vi.waitFor(async () =>
          expect((await service.getRun(started.run_id))?.complete).toBe(true),
        );
        return (await service.getRun(started.run_id))!;
      };

      enqueue.mockClear();
      const first = await run();
      expect(first).toMatchObject({
        read: 3,
        missing_files: 1,
        with_composer: 2,
        with_lyrics: 1,
        queued_embeddings: 2,
      });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledWith(
        expect.arrayContaining(
          ["m", "i"].flatMap((track_id) =>
            ["identity", "context"].map((kind) => ({ track_id, friend_id: friendId, kind })),
          ),
        ),
        "bulk",
      );
      expect(await row("m")).toMatchObject({
        composer: "Camilo, Eblis",
        audio_file_genre: ["Música tropical"],
      });
      expect(await row("i")).toMatchObject({ composer: "X, Y", audio_file_genre: ["House"] });
      expect((await row("bare")).composer).toBeNull();
      expect((await lyricsRow("m")).lyrics).toBe("words");
      expect(await lyricsRow("i")).toBeUndefined();

      expect(await run()).toMatchObject({ read: 0, skipped: 3, missing_files: 1 });
      // A forced re-read finds the composers already filled and queues nothing.
      expect(await run(true)).toMatchObject({ read: 3, queued_embeddings: 0 });
      expect(enqueue).toHaveBeenCalledTimes(1);
    },
  );
  dbTest("edited lyrics survive a forced re-read; cleared ones refill from the file", async () => {
    makeAudio("edit.m4a", [...tag("lyrics", "from the file")]);
    await insertTrack("edit", "edit.m4a");
    const service = new EmbeddedTagsBackfillService();
    const forcedRead = async () => {
      const started = await service.start({ friend_id: friendId, force: true });
      await vi.waitFor(async () =>
        expect((await service.getRun(started.run_id))?.complete).toBe(true),
      );
    };

    await forcedRead();
    expect(await trackLyricsRepository.find("edit", friendId)).toMatchObject({
      text: "from the file",
      source: "embedded",
    });

    const saved = await trackLyricsRepository.saveUserLyrics("edit", friendId, "my words");
    expect(saved).toMatchObject({ text: "my words", source: "user" });
    await forcedRead();
    expect(await trackLyricsRepository.find("edit", friendId)).toMatchObject({
      text: "my words",
      source: "user",
    });

    expect(await trackLyricsRepository.delete("edit", friendId)).toBe(true);
    expect(await trackLyricsRepository.find("edit", friendId)).toBeNull();
    expect(await trackLyricsRepository.delete("edit", friendId)).toBe(false);
    await forcedRead();
    expect(await trackLyricsRepository.find("edit", friendId)).toMatchObject({
      text: "from the file",
      source: "embedded",
    });
    expect(await trackLyricsRepository.findTrackLibrary("edit", friendId)).toBe(USERNAME);
  });
});
