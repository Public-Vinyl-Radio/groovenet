import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RecordingRejected,
  SetRecordingService,
  extensionFor,
  isSha256,
  maxRecordingBytes,
  setRecordingsDir,
  writeHashed,
} from "../setRecordingService";
import { InvalidAudioError } from "../audioProcessor";
import type { SetRecordingRow } from "@/types/setDerivation";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function body(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const probed = {
  durationSeconds: 11044,
  sampleRate: 44100,
  channels: 2,
  codec: "mp3",
  formatName: "mp3",
};

let dir: string;
let repository: { findBySha256: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
let processor: { probe: ReturnType<typeof vi.fn> };
let service: SetRecordingService;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "set-recordings-"));
  vi.stubEnv("SET_RECORDINGS_DIR", dir);
  repository = {
    findBySha256: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (input) => ({ ...input, created_at: "now" }) as SetRecordingRow),
  };
  processor = { probe: vi.fn().mockResolvedValue(probed) };
  service = new SetRecordingService(
    repository as unknown as ConstructorParameters<typeof SetRecordingService>[0],
    processor as unknown as ConstructorParameters<typeof SetRecordingService>[1]
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  it("keeps a body whose hash matches, under {sha256}.{ext from ffprobe}", async () => {
    const hash = sha(bytes);
    const { recording, created } = await service.store(hash, body(bytes.slice(0, 3), bytes.slice(3)), "set.mp3");

    expect(created).toBe(true);
    expect(recording).toMatchObject({
      sha256: hash, file_path: `${hash}.mp3`, original_filename: "set.mp3",
      format_name: "mp3", duration_seconds: 11044, size_bytes: 8,
    });
    expect(fs.readFileSync(path.join(dir, `${hash}.mp3`))).toEqual(Buffer.from(bytes));
    expect(fs.readdirSync(dir)).toEqual([`${hash}.mp3`]);
  });

  it("returns a recording it already holds without reading the body", async () => {
    const existing = { sha256: sha(bytes) } as SetRecordingRow;
    repository.findBySha256.mockResolvedValue(existing);
    const stream = body(bytes);
    const cancel = vi.spyOn(stream, "cancel");

    const result = await service.store(sha(bytes), stream, null);

    expect(result).toEqual({ recording: existing, created: false });
    expect(cancel).toHaveBeenCalled();
    expect(processor.probe).not.toHaveBeenCalled();
  });

  it("discards a body that hashes to something else: truncated in transit", async () => {
    await expect(service.store(sha(bytes), body(bytes.slice(0, 4)), null)).rejects.toMatchObject({
      code: "hash_mismatch",
    });
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("refuses a body past the size limit as it writes", async () => {
    vi.stubEnv("SET_RECORDING_MAX_BYTES", "4");
    await expect(service.store(sha(bytes), body(bytes), null)).rejects.toMatchObject({
      code: "recording_too_large",
    });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses an empty body", async () => {
    const empty = new Uint8Array();
    await expect(service.store(sha(empty), body(), null)).rejects.toMatchObject({ code: "empty_upload" });
  });

  it("refuses a missing body", async () => {
    await expect(service.store(sha(bytes), null, null)).rejects.toMatchObject({ code: "empty_upload" });
  });

  it("refuses bytes ffprobe cannot read as audio", async () => {
    processor.probe.mockRejectedValue(new InvalidAudioError("moov atom not found"));
    await expect(service.store(sha(bytes), body(bytes), null)).rejects.toMatchObject({
      code: "invalid_audio",
      message: "moov atom not found",
    });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("lets an unexpected probe failure through, still cleaning up", async () => {
    processor.probe.mockRejectedValue(new Error("ffprobe missing"));
    await expect(service.store(sha(bytes), body(bytes), null)).rejects.toThrow("ffprobe missing");
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses a malformed sha256", async () => {
    await expect(service.store("ABC", body(bytes), null)).rejects.toBeInstanceOf(RecordingRejected);
  });
});

describe("find and pathOf", () => {
  it("does not query for a malformed sha256", async () => {
    expect(await service.find("../etc/passwd")).toBeNull();
    expect(repository.findBySha256).not.toHaveBeenCalled();
  });

  it("looks a well-formed sha256 up", async () => {
    await service.find("a".repeat(64));
    expect(repository.findBySha256).toHaveBeenCalledWith("a".repeat(64));
  });

  it("resolves a stored recording inside the volume and refuses to escape it", () => {
    expect(service.pathOf({ file_path: "x.mp3" } as SetRecordingRow)).toBe(path.join(dir, "x.mp3"));
    expect(() => service.pathOf({ file_path: "../x.mp3" } as SetRecordingRow)).toThrow("outside");
  });
});

describe("writeHashed", () => {
  it("waits for the file to drain on a large write", async () => {
    const big = new Uint8Array(4 * 1024 * 1024).fill(7);
    const target = path.join(dir, "big");
    const { digest, size } = await writeHashed(body(big, big), target, 1e9);
    expect(size).toBe(big.length * 2);
    expect(digest).toBe(createHash("sha256").update(big).update(big).digest("hex"));
    expect(fs.statSync(target).size).toBe(size);
  });
});

describe("helpers", () => {
  it.each([
    ["mp3", "mp3"],
    ["mov,mp4,m4a,3gp,3g2,mj2", "m4a"],
    ["matroska,webm", "mkv"],
    ["flac", "flac"],
    [null, "audio"],
    ["../../etc", "audio"],
  ])("stores %s as .%s", (format, ext) => {
    expect(extensionFor(format)).toBe(ext);
  });

  it("recognises a sha256", () => {
    expect(isSha256("f".repeat(64))).toBe(true);
    expect(isSha256("F".repeat(64))).toBe(false);
    expect(isSha256("f".repeat(63))).toBe(false);
  });

  it("defaults the volume and the size limit", () => {
    vi.stubEnv("SET_RECORDINGS_DIR", "");
    vi.stubEnv("SET_RECORDING_MAX_BYTES", "");
    expect(setRecordingsDir()).toBe("/app/set-recordings");
    expect(maxRecordingBytes()).toBe(2 * 1024 ** 3);
  });
});
