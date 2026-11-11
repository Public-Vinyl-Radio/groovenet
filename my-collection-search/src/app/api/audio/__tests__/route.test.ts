import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET } from "../route";

let audioDir: string;

beforeAll(() => {
  audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-route-"));
  for (const ext of ["flac", "mp3", "m4a", "wav", "aac", "ogg", "webm", "bin"]) {
    fs.writeFileSync(path.join(audioDir, `track.${ext}`), Buffer.from("0123456789"));
  }
});

afterAll(() => fs.rmSync(audioDir, { recursive: true, force: true }));

beforeEach(() => vi.stubEnv("AUDIO_DIR", audioDir));

const get = (filename: string, headers?: HeadersInit) =>
  GET(
    new Request(`http://localhost/api/audio?filename=${encodeURIComponent(filename)}`, {
      headers,
    }),
  );

describe("GET /api/audio content type", () => {
  it.each([
    ["track.flac", "audio/flac"],
    ["track.mp3", "audio/mpeg"],
    ["track.m4a", "audio/mp4"],
    ["track.wav", "audio/wav"],
    ["track.aac", "audio/aac"],
    ["track.ogg", "audio/ogg"],
    ["track.webm", "audio/webm"],
    ["track.bin", "audio/mpeg"],
  ])("serves %s as %s", async (filename, contentType) => {
    const res = await get(filename);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(contentType);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("0123456789");
  });

  it("serves a range of a .flac as audio/flac", async () => {
    const res = await get("track.flac", { range: "bytes=2-5" });

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Type")).toBe("audio/flac");
  });
});
