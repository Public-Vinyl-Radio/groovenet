/**
 * ffprobe inspection (#275).
 *
 * Runs against the real binary — the whole point of this class is that it does
 * not trust the filename, and a mocked ffprobe would test nothing.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AudioProcessor, InvalidAudioError } from "../audioProcessor";

function hasFfprobe(): boolean {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// CI installs ffprobe and asserts it, so these cannot silently stop running.
const probeTest = it.skipIf(!hasFfprobe());

function wav(seconds: number, sampleRate = 44100, channels = 1): Buffer {
  const samples = Math.floor(seconds * sampleRate);
  const dataBytes = samples * channels * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  const body = Buffer.alloc(dataBytes);
  for (let i = 0; i < samples * channels; i += 1) {
    body.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i * 2);
  }
  return Buffer.concat([header, body]);
}

let dir: string;
const processor = new AudioProcessor();

function write(name: string, bytes: Buffer): string {
  const target = path.join(dir, name);
  fs.writeFileSync(target, bytes);
  return target;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-probe-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("AudioProcessor.probe()", () => {
  probeTest("reads duration, rate and channels from a real WAV", async () => {
    const result = await processor.probe(write("chunk.wav", wav(15)));

    expect(result.durationSeconds).toBeCloseTo(15, 1);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(1);
    expect(result.codec).toBe("pcm_s16le");
    expect(result.formatName).toContain("wav");
  });

  probeTest("reports stereo correctly", async () => {
    const result = await processor.probe(write("s.wav", wav(5, 22050, 2)));

    expect(result.channels).toBe(2);
    expect(result.sampleRate).toBe(22050);
  });

  probeTest("rejects a file that merely claims to be a WAV", async () => {
    // The reason this class exists. An extension is a claim, not evidence.
    const target = write("chunk.wav", Buffer.from("this is plainly not audio"));

    await expect(processor.probe(target)).rejects.toBeInstanceOf(InvalidAudioError);
  });

  probeTest("rejects a truncated header", async () => {
    const target = write("chunk.wav", wav(10).subarray(0, 20));

    await expect(processor.probe(target)).rejects.toBeInstanceOf(InvalidAudioError);
  });

  probeTest("rejects a file with no audio stream", async () => {
    // A 1x1 PNG: a valid file ffprobe understands, with nothing to fingerprint.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const target = write("chunk.png", png);

    await expect(processor.probe(target)).rejects.toThrow(/no audio stream|could not read/);
  });

  probeTest("rejects a file that does not exist", async () => {
    await expect(
      processor.probe(path.join(dir, "absent.wav"))
    ).rejects.toBeInstanceOf(InvalidAudioError);
  });

  probeTest("rejects an empty file", async () => {
    const target = write("empty.wav", Buffer.alloc(0));

    await expect(processor.probe(target)).rejects.toBeInstanceOf(InvalidAudioError);
  });
});
