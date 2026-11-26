/**
 * Alternate audio files against a real Postgres and real files (#1310): the
 * composite foreign key and cascade, the `xmax = 0` insert-or-update flag, and
 * the backfill that links `<stem>.m4a` beside a linked `<stem>.flac`.
 * Run with `just backfill-test`.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { trackAudioFileService } from "../trackAudioFileService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "track-audio-files-friend";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "track-audio-files-"));
let friendId = 0;

function makeAudio(name: string) {
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=1", path.join(dir, name)],
    { stdio: "ignore" },
  );
}

async function insertTrack(trackId: string, file: string | null) {
  await dbQuery(
    `INSERT INTO tracks (track_id, username, friend_id, title, artist, local_audio_url)
     VALUES ($1, $2, $3, 't', 'a', $4)`,
    [trackId, USERNAME, friendId, file],
  );
}

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

describe("alternate audio files (real Postgres)", () => {
  dbTest("backfill links an m4a beside a flac once, and lists both formats", async () => {
    makeAudio("pair.flac");
    makeAudio("pair.m4a");
    makeAudio("solo.flac");
    makeAudio("stray.m4a"); // no track links stray.flac
    await insertTrack("pair", "pair.flac");
    await insertTrack("solo", "solo.flac");
    await insertTrack("gone", "gone.flac");

    const first = await trackAudioFileService.backfillSiblingAlternates();
    expect(first).toMatchObject({ linked: 1, failed: 0 });
    const second = await trackAudioFileService.backfillSiblingAlternates();
    expect(second).toMatchObject({ linked: 0, already_linked: 1, failed: 0 });

    const files = await trackAudioFileService.listFiles({
      track_id: "pair",
      friend_id: friendId,
      local_audio_url: "pair.flac",
    });
    expect(files.map((f) => [f.filename, f.primary])).toEqual([
      ["pair.flac", true],
      ["pair.m4a", false],
    ]);
    expect(files[1]).toMatchObject({ codec: "aac", container: "m4a", lossless: false });
    expect(Number(files[1].size_bytes)).toBeGreaterThan(0);
  });

  dbTest("removing the track removes its alternate links", async () => {
    await dbQuery(`DELETE FROM tracks WHERE track_id = 'pair' AND friend_id = $1`, [friendId]);
    const { rows } = await dbQuery(`SELECT 1 FROM track_audio_files WHERE track_id = 'pair'`);
    expect(rows).toHaveLength(0);
  });
});
