/**
 * Accepting a chunk from a listener device (#275).
 *
 * Fixtures are built here rather than committed: a real WAV is a 44-byte
 * header and some samples, and a binary in the repo is one more thing nobody
 * can diff.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repo = vi.hoisted(() => ({ create: vi.fn(), findByDedupeKey: vi.fn() }));
const redis = vi.hoisted(() => ({ lpush: vi.fn() }));

vi.mock("@/server/repositories/audioIngestRepository", () => ({
  audioIngestRepository: repo,
}));
vi.mock("@/lib/redis", () => ({ getRedisConnection: () => redis }));

import {
  AudioIngestService,
  FINGERPRINT_QUEUE_KEY,
  IngestRejected,
  loadIngestLimits,
} from "../audioIngestService";
import { InvalidAudioError, type ProbedAudio } from "../audioProcessor";
import type { IngestLimits } from "@/types/audioIngest";

/** A real, playable WAV of `seconds` of quiet tone. */
function wav(seconds = 15, sampleRate = 44100, channels = 1): Buffer {
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
  for (let i = 0; i < samples; i += 1) {
    body.writeInt16LE(Math.round(8000 * Math.sin(i / 20)), i * 2 * channels);
  }
  return Buffer.concat([header, body]);
}

function upload(bytes: Buffer, name = "chunk.wav"): File {
  return new File([new Uint8Array(bytes)], name, { type: "audio/wav" });
}

function probed(overrides: Partial<ProbedAudio> = {}): ProbedAudio {
  return {
    durationSeconds: 15.02,
    sampleRate: 44100,
    channels: 1,
    codec: "pcm_s16le",
    formatName: "wav",
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    source_id: "living-room-vinyl",
    session_id: null,
    sequence: null,
    captured_at: null,
    received_at: new Date("2026-09-20T18:42:10Z"),
    duration_seconds: 15.02,
    sample_rate: 44100,
    channels: 1,
    codec: "pcm_s16le",
    file_path: "2026-09-20/abc.wav",
    status: "received",
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const limits: IngestLimits = {
  maxBytes: 20 * 1024 * 1024,
  minDurationSeconds: 3,
  maxDurationSeconds: 60,
};

let dir: string;
const savedEnv = { ...process.env };

function makeService(probe = vi.fn().mockResolvedValue(probed())) {
  return {
    service: new AudioIngestService({ probe } as never),
    probe,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-accept-"));
  process.env.AUDIO_INGEST_DIR = dir;
  repo.findByDedupeKey.mockResolvedValue(null);
  repo.create.mockImplementation(async (input: Record<string, unknown>) =>
    row(input)
  );
  redis.lpush.mockResolvedValue(1);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

function leftovers(): string[] {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
    );
  return fs.existsSync(dir) ? walk(dir) : [];
}

// ─── the happy path ───────────────────────────────────────────────────────────

describe("accept() — a valid upload", () => {
  it("creates exactly one record and returns 'accepted'", async () => {
    const { service } = makeService();

    const result = await service.accept(
      upload(wav()),
      { source_id: "living-room-vinyl" },
      limits
    );

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "accepted",
      source_id: "living-room-vinyl",
      duration_seconds: 15.02,
      sample_rate: 44100,
      channels: 1,
    });
  });

  it("writes the audio into a dated folder on the ingest volume", async () => {
    const { service } = makeService();

    await service.accept(upload(wav()), { source_id: "s" }, limits);

    const stored = leftovers();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/\d{4}-\d{2}-\d{2}[/\\][0-9a-f-]+\.wav$/);
  });

  it("records what ffprobe found, not what the filename claimed", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ codec: "flac", formatName: "flac" }))
    );

    await service.accept(upload(wav(), "lying.wav"), { source_id: "s" }, limits);

    expect(repo.create.mock.calls[0][0]).toMatchObject({ codec: "flac" });
    expect(leftovers()[0]).toMatch(/\.flac$/);
  });

  it("queues the chunk for the fingerprint service", async () => {
    const { service } = makeService();

    await service.accept(
      upload(wav()),
      {
        source_id: "living-room-vinyl",
        session_id: "sess-1",
        sequence: 42,
        captured_at: "2026-09-20T18:42:10.000Z",
      },
      limits
    );

    expect(redis.lpush).toHaveBeenCalledTimes(1);
    const [queue, payload] = redis.lpush.mock.calls[0];
    expect(queue).toBe(FINGERPRINT_QUEUE_KEY);
    expect(JSON.parse(payload)).toMatchObject({
      source_id: "living-room-vinyl",
      session_id: "sess-1",
      sequence: 42,
      duration_seconds: 15.02,
      sample_rate: 44100,
      channels: 1,
      codec: "pcm_s16le",
    });
  });

  it("queues a path relative to the ingest volume", async () => {
    // fingerprint-service resolves it against AUDIO_INGEST_DIR and refuses
    // anything escaping the volume, so an absolute path would be rejected.
    const { service } = makeService();

    await service.accept(upload(wav()), { source_id: "s" }, limits);

    const { file_path } = JSON.parse(redis.lpush.mock.calls[0][1]);
    expect(path.isAbsolute(file_path)).toBe(false);
  });

  it("still accepts the chunk when the queue is unreachable", async () => {
    // The row exists and the file is on disk, so the work is recoverable.
    // Answering 500 would make the device retry an upload that did land.
    redis.lpush.mockRejectedValue(new Error("redis is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = makeService();

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).resolves.toMatchObject({ status: "accepted" });
    expect(logged).toHaveBeenCalled();
  });
});

// ─── rejections ───────────────────────────────────────────────────────────────

describe("accept() — rejections", () => {
  it("refuses a missing source_id", async () => {
    const { service } = makeService();

    await expect(
      service.accept(upload(wav()), { source_id: "  " }, limits)
    ).rejects.toMatchObject({ code: "missing_source_id" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a file that is not audio", async () => {
    const { service } = makeService(
      vi.fn().mockRejectedValue(new InvalidAudioError("no audio stream"))
    );

    await expect(
      service.accept(upload(Buffer.from("not audio at all"), "chunk.wav"), { source_id: "s" }, limits)
    ).rejects.toMatchObject({ code: "invalid_audio_stream" });
  });

  it("refuses an unsupported container", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ formatName: "mov,mp4,m4a" }))
    );

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).rejects.toMatchObject({ code: "unsupported_audio_format" });
  });

  it("refuses audio under the minimum duration", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ durationSeconds: 1.2 }))
    );

    await expect(
      service.accept(upload(wav(1)), { source_id: "s" }, limits)
    ).rejects.toMatchObject({ code: "audio_too_short" });
  });

  it("refuses audio over the maximum duration", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ durationSeconds: 120 }))
    );

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).rejects.toMatchObject({ code: "audio_too_long" });
  });

  it("refuses an oversized upload", async () => {
    const { service } = makeService();

    await expect(
      service.accept(upload(wav(15)), { source_id: "s" }, {
        ...limits,
        maxBytes: 1000,
      })
    ).rejects.toMatchObject({ code: "audio_too_large" });
  });

  it("stops reading an oversized upload rather than buffering it", async () => {
    // The point of streaming: the limit is enforced during the write, so a
    // device sending a gigabyte does not cost a gigabyte of memory first.
    const { service, probe } = makeService();

    await expect(
      service.accept(upload(wav(60)), { source_id: "s" }, { ...limits, maxBytes: 4096 })
    ).rejects.toMatchObject({ code: "audio_too_large" });
    expect(probe).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid audio", vi.fn().mockRejectedValue(new InvalidAudioError("bad"))],
    ["too short", vi.fn().mockResolvedValue(probed({ durationSeconds: 0.5 }))],
    ["unsupported", vi.fn().mockResolvedValue(probed({ formatName: "mov" }))],
  ])("leaves no temp file behind when rejecting: %s", async (_label, probe) => {
    const { service } = makeService(probe as never);

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).rejects.toBeInstanceOf(IngestRejected);

    expect(leftovers()).toEqual([]);
  });

  it("leaves no temp file behind when the upload is too large", async () => {
    const { service } = makeService();

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, { ...limits, maxBytes: 512 })
    ).rejects.toBeInstanceOf(IngestRejected);

    expect(leftovers()).toEqual([]);
  });

  it("never records or queues a rejected chunk", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ durationSeconds: 0.5 }))
    );

    await expect(
      service.accept(upload(wav(1)), { source_id: "s" }, limits)
    ).rejects.toBeInstanceOf(IngestRejected);

    expect(repo.create).not.toHaveBeenCalled();
    expect(redis.lpush).not.toHaveBeenCalled();
  });
});

describe("accept() — container handling", () => {
  it.each([
    ["wav", "wav", /\.wav$/],
    ["flac", "flac", /\.flac$/],
    ["ogg", "ogg", /\.ogg$/],
    ["matroska,webm", "webm", /\.webm$/],
  ])("stores %s audio with a matching extension", async (formatName, _ext, pattern) => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ formatName }))
    );

    await service.accept(upload(wav()), { source_id: "s" }, limits);

    expect(leftovers()[0]).toMatch(pattern);
  });

  it("refuses audio ffprobe could not name a container for", async () => {
    const { service } = makeService(
      vi.fn().mockResolvedValue(probed({ formatName: null }))
    );

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).rejects.toMatchObject({ code: "unsupported_audio_format" });
  });

  it("re-raises an unexpected probe failure rather than blaming the device", async () => {
    // A broken ffprobe install is a 500, not a "your audio is bad".
    const { service } = makeService(
      vi.fn().mockRejectedValue(new Error("ffprobe binary is missing"))
    );

    await expect(
      service.accept(upload(wav()), { source_id: "s" }, limits)
    ).rejects.toThrow(/ffprobe binary is missing/);
    expect(leftovers()).toEqual([]);
  });

  it("reports a duration of zero when the record somehow has none", async () => {
    repo.create.mockResolvedValue(row({ duration_seconds: null }));
    const { service } = makeService();

    const result = await service.accept(upload(wav()), { source_id: "s" }, limits);

    expect(result.duration_seconds).toBe(0);
  });

  it("returns captured_at as an ISO string", async () => {
    repo.create.mockResolvedValue(
      row({ captured_at: new Date("2026-09-20T18:42:10Z") })
    );
    const { service } = makeService();

    const result = await service.accept(upload(wav()), { source_id: "s" }, limits);

    expect(result.captured_at).toBe("2026-09-20T18:42:10.000Z");
  });
});

// ─── idempotency ──────────────────────────────────────────────────────────────

describe("accept() — retries", () => {
  it("returns the original ingest for a duplicate sequence", async () => {
    // The Pi retries on network loss; a retry that already landed must not
    // create a second row and a second copy of the audio.
    repo.findByDedupeKey.mockResolvedValue(row({ id: "original-id" }));
    const { service, probe } = makeService();

    const result = await service.accept(
      upload(wav()),
      { source_id: "living-room-vinyl", session_id: "sess-1", sequence: 42 },
      limits
    );

    expect(result.ingest_id).toBe("original-id");
    expect(repo.create).not.toHaveBeenCalled();
    expect(redis.lpush).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    expect(leftovers()).toEqual([]);
  });

  it("only dedupes when there is a session and sequence to key on", async () => {
    const { service } = makeService();

    await service.accept(upload(wav()), { source_id: "s" }, limits);

    expect(repo.findByDedupeKey).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it("looks up the duplicate by source, session and sequence", async () => {
    const { service } = makeService();

    await service.accept(
      upload(wav()),
      { source_id: "living-room-vinyl", session_id: "sess-1", sequence: 7 },
      limits
    );

    expect(repo.findByDedupeKey).toHaveBeenCalledWith("living-room-vinyl", "sess-1", 7);
  });
});

// ─── limits from the environment ──────────────────────────────────────────────

describe("loadIngestLimits()", () => {
  it("defaults to 20 MB, 3s and 60s", () => {
    delete process.env.AUDIO_INGEST_MAX_UPLOAD_BYTES;
    delete process.env.AUDIO_INGEST_MIN_DURATION_SECONDS;
    delete process.env.AUDIO_INGEST_MAX_DURATION_SECONDS;

    expect(loadIngestLimits()).toEqual({
      maxBytes: 20 * 1024 * 1024,
      minDurationSeconds: 3,
      maxDurationSeconds: 60,
    });
  });

  it("reads the environment", () => {
    process.env.AUDIO_INGEST_MAX_UPLOAD_BYTES = "1024";
    process.env.AUDIO_INGEST_MIN_DURATION_SECONDS = "1";
    process.env.AUDIO_INGEST_MAX_DURATION_SECONDS = "30";

    expect(loadIngestLimits()).toEqual({
      maxBytes: 1024,
      minDurationSeconds: 1,
      maxDurationSeconds: 30,
    });
  });

  it.each(["0", "-1", "nonsense"])(
    "falls back to the default for %o rather than rejecting everything",
    (value) => {
      process.env.AUDIO_INGEST_MAX_DURATION_SECONDS = value;
      expect(loadIngestLimits().maxDurationSeconds).toBe(60);
    }
  );
});
