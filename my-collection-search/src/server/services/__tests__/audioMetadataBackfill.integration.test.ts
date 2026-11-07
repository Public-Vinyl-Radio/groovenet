/**
 * The audio-metadata backfill against a real Postgres and real files (#1049).
 *
 * The candidate query, the `audio_source` CHECK constraint and the bigint/
 * timestamptz columns are things a mocked `dbQuery` accepts and a real driver
 * may not. Files are generated with ffmpeg and probed with ffprobe, so the
 * classifier sees genuine tag output. Redis is replaced with a counter map:
 * only Postgres and the filesystem are under test. Run with `just backfill-test`.
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
      hgetall: async (k: string) => counters.get(k) ?? {},
      lrange: async () => [],
    }),
  };
});

import { dbPool, dbQuery } from "@/lib/serverDb";
import { AudioMetadataBackfillService } from "../audioMetadataBackfillService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "audio-backfill-friend";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-backfill-"));
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

async function insertTrack(trackId: string, file: string | null, source: string | null = null) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, local_audio_url, audio_source)
     VALUES ($1, $2, $3, 't', 'a', $4, $5)`,
    [trackId, USERNAME, friendId, file, source],
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
  process.env.AUDIO_DIR = dir;
  process.env.AUDIO_BACKFILL_DELAY_MS = "0";
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

describe("audio metadata backfill (real Postgres)", () => {
  dbTest("fills fields and sources, reports missing files, and is idempotent", async () => {
    makeAudio("yt.m4a", ["-metadata", "comment=https://www.youtube.com/watch?v=abcdefghijk"]);
    makeAudio("plain.flac");
    makeAudio("audio_1767225600000_42.m4a");
    makeAudio("kept.m4a");
    await insertTrack("yt", "yt.m4a");
    await insertTrack("plain", "plain.flac");
    await insertTrack("upl", "audio_1767225600000_42.m4a");
    await insertTrack("kept", "kept.m4a", "apple_music");
    await insertTrack("gone", "gone.m4a");
    await insertTrack("nofile", null);

    const service = new AudioMetadataBackfillService();
    const start = async (force = false) => {
      const started = await service.start({ friend_id: friendId, force });
      await vi.waitFor(async () =>
        expect((await service.getRun(started.run_id))?.complete).toBe(true),
      );
      return (await service.getRun(started.run_id))!;
    };

    const first = await start();
    expect(first).toMatchObject({ total: 5, probed: 4, skipped: 0, missing_files: 1 });
    expect(first.sources).toMatchObject({ youtube: 1, upload: 1, apple_music: 1, unknown: 1 });

    expect(await row("yt")).toMatchObject({
      audio_source: "youtube",
      audio_codec: "aac",
      audio_container: "m4a",
      audio_lossless: false,
    });
    const flac = await row("plain");
    expect(flac).toMatchObject({
      audio_source: "unknown",
      audio_codec: "flac",
      audio_lossless: true,
      audio_sample_rate: 44100,
    });
    expect(Number(flac.audio_size_bytes)).toBeGreaterThan(0);
    expect(flac.audio_probed_at).toBeInstanceOf(Date);
    expect((await row("upl")).audio_source).toBe("upload");
    expect((await row("kept")).audio_source).toBe("apple_music");
    expect((await row("gone")).audio_probed_at).toBeNull();
    expect((await row("nofile")).audio_probed_at).toBeNull();

    const second = await start();
    expect(second).toMatchObject({ probed: 0, skipped: 4, missing_files: 1 });

    const forced = await start(true);
    expect(forced.probed).toBe(4);
  });
});
