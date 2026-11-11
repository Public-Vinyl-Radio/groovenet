/**
 * What an upload leaves on disk (#1155), against real ffmpeg and ffprobe.
 *
 * The mocked suite checks which commands run; this one checks what they make.
 * Only the database, the embedding queue and Essentia are faked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const { mockUpdateTrackAnalysis, mockFindTracksByTrackId } = vi.hoisted(() => ({
  mockUpdateTrackAnalysis: vi.fn(),
  mockFindTracksByTrackId: vi.fn(),
}));

vi.mock("@/lib/essentia-storage", () => ({ writeEssentiaAnalysis: vi.fn() }));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    updateTrackAnalysisByTrackId: mockUpdateTrackAnalysis,
    findTracksByTrackId: mockFindTracksByTrackId,
  },
}));
vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue: vi.fn() },
}));

import { POST } from "../route";
import {
  audioFieldsFromProbe,
  trackAudioMetadataService,
} from "@/server/services/trackAudioMetadataService";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// CI installs both and asserts it, so these cannot silently stop running.
const ffmpegTest = it.skipIf(!hasFfmpeg());

let root: string;
let fixtures: string;
let audioDir: string;
let cover: string;

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
}

/** One second of tone, tagged, encoded with `codecArgs` into `name`. */
function fixture(name: string, codecArgs: string[], withCover = false): string {
  const out = path.join(fixtures, name);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1:sample_rate=48000",
    ...(withCover
      ? ["-i", cover, "-map", "0:a", "-map", "1:v", "-disposition:v", "attached_pic"]
      : []),
    "-metadata",
    "title=Upload Fixture",
    ...codecArgs,
    out,
  ]);
  return out;
}

function upload(filePath: string, fileName: string) {
  const form = new FormData();
  form.append("file", new File([fs.readFileSync(filePath)], fileName));
  form.append("track_id", "t1");
  form.append("friend_id", "1");
  return new NextRequest("http://localhost/api/tracks/upload", { method: "POST", body: form });
}

type Probe = {
  streams?: Array<{ codec_type?: string; disposition?: { attached_pic?: number } }>;
  format?: { tags?: Record<string, string> };
};

describe("POST /api/tracks/upload on disk (#1155)", () => {
  beforeAll(() => {
    if (!hasFfmpeg()) return;
    root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-route-"));
    fixtures = path.join(root, "fixtures");
    audioDir = path.join(root, "audio");
    fs.mkdirSync(fixtures);
    cover = path.join(fixtures, "cover.png");
    ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=16x16", "-frames:v", "1", cover]);
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    if (audioDir) fs.rmSync(audioDir, { recursive: true, force: true });
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.stubEnv("AUDIO_DIR", audioDir);
    mockUpdateTrackAnalysis.mockResolvedValue(undefined);
    mockFindTracksByTrackId.mockResolvedValue([{ track_id: "t1", friend_id: 1 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rhythm: { bpm: 120 } }) }),
    );
  });

  async function stored(res: Response) {
    expect(res.status).toBe(200);
    const body = await res.json();
    const filePath = path.join(audioDir, body.local_audio_url);
    const probe = (await trackAudioMetadataService.runFfprobe(filePath)) as Probe;
    // Only the stored file is left: no upload and no essentia WAV.
    expect(fs.readdirSync(audioDir)).toEqual([body.local_audio_url]);
    expect(fs.readdirSync(path.join(root, "tmp", "uploads"))).toEqual([]);
    return { body, filePath, probe, fields: audioFieldsFromProbe(probe) };
  }

  ffmpegTest("keeps a FLAC upload byte for byte", async () => {
    const src = fixture("in.flac", ["-c:a", "flac"]);

    const { body, filePath, fields } = await stored(await POST(upload(src, "in.flac")));

    expect(body).toMatchObject({ format: "flac", lossless: true });
    expect(fs.readFileSync(filePath).equals(fs.readFileSync(src))).toBe(true);
    expect(fields).toMatchObject({ audio_codec: "flac", audio_lossless: true });
  });

  ffmpegTest.each([
    ["24-bit WAV", "in.wav", ["-c:a", "pcm_s24le"], 24, false],
    ["AIFF", "in.aiff", ["-c:a", "pcm_s16be"], 16, false],
    ["ALAC with a cover", "in.m4a", ["-c:a", "alac", "-c:v", "copy"], 16, true],
  ] as const)(
    "converts a %s upload to FLAC, keeping tags",
    async (_kind, name, codecArgs, depth, withCover) => {
      const src = fixture(name, [...codecArgs], withCover);

      const { body, fields, probe } = await stored(await POST(upload(src, name)));

      expect(body).toMatchObject({ format: "flac", lossless: true });
      expect(fields).toMatchObject({
        audio_codec: "flac",
        audio_container: "flac",
        audio_lossless: true,
        audio_sample_rate: 48000,
        audio_bit_depth: depth,
      });
      const tags = Object.fromEntries(
        Object.entries(probe.format?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      expect(tags.title).toBe("Upload Fixture");
      const hasCover = (probe.streams ?? []).some((s) => s.disposition?.attached_pic === 1);
      expect(hasCover).toBe(withCover);
    },
  );

  ffmpegTest.each([
    ["MP3", "in.mp3", ["-c:a", "libmp3lame", "-b:a", "128k"], "mp3", "mp3"],
    ["AAC", "in.m4a", ["-c:a", "aac", "-b:a", "128k"], "m4a", "aac"],
  ] as const)("keeps a %s upload as uploaded", async (_kind, name, codecArgs, ext, codec) => {
    const src = fixture(name, [...codecArgs]);

    const { body, filePath, fields } = await stored(await POST(upload(src, name)));

    expect(body).toMatchObject({ format: ext, lossless: false });
    expect(fs.readFileSync(filePath).equals(fs.readFileSync(src))).toBe(true);
    expect(fields).toMatchObject({
      audio_codec: codec,
      audio_container: ext,
      audio_lossless: false,
    });
  });

  ffmpegTest("stores a hostile filename under a generated name", async () => {
    const src = fixture("hostile.mp3", ["-c:a", "libmp3lame"]);
    const name = '../../$(touch pwned)"; touch pwned2 #.mp3';

    const { body } = await stored(await POST(upload(src, name)));

    expect(body.local_audio_url).toMatch(/^audio_\d+_[0-9a-f-]{36}\.mp3$/);
    expect(fs.existsSync(path.join(root, "pwned"))).toBe(false);
    expect(fs.existsSync(path.join(root, "pwned2"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "pwned"))).toBe(false);
  });
});
