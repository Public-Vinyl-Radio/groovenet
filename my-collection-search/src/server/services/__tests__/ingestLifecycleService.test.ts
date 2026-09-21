/**
 * The audio_ingests lifecycle after `received` (#276).
 *
 *     received ──claim──▶ processing ──report──▶ processed
 *        │                    │                     failed
 *        └────────────────────┴───────reap──────▶ failed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ingests = vi.hoisted(() => ({
  findById: vi.fn(),
  transitionStatus: vi.fn(),
  listStale: vi.fn(),
}));
const detections = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/server/repositories/audioIngestRepository", () => ({
  audioIngestRepository: ingests,
}));
vi.mock("@/server/repositories/playDetectionRepository", () => ({
  playDetectionRepository: detections,
}));

import {
  IngestLifecycleService,
  IngestNotFound,
  startIngestReaper,
  reapIntervalMs,
  reapTick,
  resetReapClock,
  stalledAfterMs,
} from "../ingestLifecycleService";
import type { IngestResultReport } from "@/types/audioIngest";

const service = new IngestLifecycleService();
let dir: string;
const savedEnv = { ...process.env };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "ingest-1",
    source_id: "living-room-vinyl",
    session_id: "sess-1",
    sequence: 42,
    captured_at: "2026-09-20T18:42:10.000Z",
    received_at: new Date(),
    duration_seconds: 15.02,
    sample_rate: 44100,
    channels: 1,
    codec: "pcm_s16le",
    file_path: "2026-09-20/chunk.wav",
    status: "received",
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function report(overrides: Partial<IngestResultReport> = {}): IngestResultReport {
  return {
    ingest_id: "ingest-1",
    status: "processed",
    error: null,
    window_start_at: "2026-09-20T18:42:10.000Z",
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    candidates: [],
    ...overrides,
  };
}

function writeChunk(relative = "2026-09-20/chunk.wav"): string {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.alloc(64));
  return target;
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-life-"));
  process.env.AUDIO_INGEST_DIR = dir;
  resetReapClock();
  ingests.findById.mockResolvedValue(row());
  ingests.transitionStatus.mockImplementation(async (_id, to) => row({ status: to }));
  ingests.listStale.mockResolvedValue([]);
  detections.create.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
});

// ─── claim ────────────────────────────────────────────────────────────────────

describe("claim()", () => {
  it("moves a received ingest into processing", async () => {
    const result = await service.claim("ingest-1");

    expect(ingests.transitionStatus).toHaveBeenCalledWith("ingest-1", "processing", [
      "received",
    ]);
    expect(result.status).toBe("processing");
  });

  it("does not drag a finished ingest back into flight", async () => {
    // A replayed or duplicated job must not undo a real result.
    ingests.transitionStatus.mockResolvedValue(null);
    ingests.findById.mockResolvedValue(row({ status: "processed" }));

    const result = await service.claim("ingest-1");

    expect(result.status).toBe("processed");
  });

  it("404s an ingest that does not exist", async () => {
    ingests.transitionStatus.mockResolvedValue(null);
    ingests.findById.mockResolvedValue(null);

    await expect(service.claim("nope")).rejects.toBeInstanceOf(IngestNotFound);
  });
});

// ─── report ───────────────────────────────────────────────────────────────────

describe("report()", () => {
  it("records a no-match window as a row, not an absence", async () => {
    // #279 finds the boundary between plays by looking for the gap.
    await service.report(report({ candidates: [] }));

    expect(detections.create).toHaveBeenCalledTimes(1);
    expect(detections.create.mock.calls[0][0]).toMatchObject({
      ingest_id: "ingest-1",
      track_id: null,
      friend_id: null,
      confidence: null,
    });
  });

  it("records a match with its confidence and offset", async () => {
    await service.report(
      report({
        candidates: [
          { track_id: "t1", friend_id: 1, confidence: 0.94, offset_seconds: 12.4 },
        ],
      })
    );

    expect(detections.create.mock.calls[0][0]).toMatchObject({
      track_id: "t1",
      friend_id: 1,
      confidence: 0.94,
      offset_seconds: 12.4,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });
  });

  it("carries the source and session onto the detection", async () => {
    await service.report(report());

    expect(detections.create.mock.calls[0][0]).toMatchObject({
      source_id: "living-room-vinyl",
      session_id: "sess-1",
    });
  });

  it("falls back to the ingest's captured_at when the report has no window", async () => {
    await service.report(report({ window_start_at: null }));

    expect(detections.create.mock.calls[0][0].window_start_at).toBe(
      "2026-09-20T18:42:10.000Z"
    );
  });

  it("records a null window when neither side knows when it was captured", async () => {
    // captured_at is optional on upload; #279 then has only the arrival order
    // to go on, which is worse but not nothing.
    ingests.findById.mockResolvedValue(row({ captured_at: null }));

    await service.report(report({ window_start_at: null }));

    expect(detections.create.mock.calls[0][0].window_start_at).toBeNull();
  });

  it("records a null engine when the report names none", async () => {
    await service.report(
      report({ fingerprint_type: null, fingerprint_version: null })
    );

    expect(detections.create.mock.calls[0][0]).toMatchObject({
      fingerprint_type: null,
      fingerprint_version: null,
    });
  });

  it("moves the ingest to processed", async () => {
    await service.report(report());

    expect(ingests.transitionStatus).toHaveBeenCalledWith(
      "ingest-1",
      "processed",
      ["received", "processing"],
      null
    );
  });

  it("records the error on a failed chunk", async () => {
    await service.report(report({ status: "failed", error: "decode failed" }));

    expect(ingests.transitionStatus).toHaveBeenCalledWith(
      "ingest-1",
      "failed",
      ["received", "processing"],
      "decode failed"
    );
  });

  it("writes no detections for a failed chunk", async () => {
    // Nothing was heard, so there is nothing to record about what it was.
    await service.report(report({ status: "failed", error: "decode failed" }));

    expect(detections.create).not.toHaveBeenCalled();
  });

  it("writes the detections before moving the status", async () => {
    // A `processed` ingest with no rows is indistinguishable from a genuine
    // no-match; one still `processing` with rows is recoverable.
    await service.report(report());

    expect(detections.create.mock.invocationCallOrder[0]).toBeLessThan(
      ingests.transitionStatus.mock.invocationCallOrder[0]
    );
  });

  it("releases the raw audio", async () => {
    const chunk = writeChunk();

    await service.report(report());

    expect(fs.existsSync(chunk)).toBe(false);
  });

  it("releases the audio even when the status transition raced", async () => {
    // A file kept because a status update lost a race is a file nothing will
    // ever come back for.
    const chunk = writeChunk();
    ingests.transitionStatus.mockResolvedValue(null);

    await service.report(report());

    expect(fs.existsSync(chunk)).toBe(false);
  });

  it("tolerates audio that is already gone", async () => {
    // The sweeper may have taken it first; that is the outcome we wanted.
    await expect(service.report(report())).resolves.toBeTruthy();
  });

  it("refuses to delete a path outside the ingest volume", async () => {
    ingests.findById.mockResolvedValue(row({ file_path: "../../etc/passwd" }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await service.report(report());

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("outside the ingest volume")
    );
  });

  it("does nothing about the file when the ingest never had one", async () => {
    ingests.findById.mockResolvedValue(row({ file_path: null }));

    await expect(service.report(report())).resolves.toBeTruthy();
  });

  it("404s a result for an unknown ingest", async () => {
    ingests.findById.mockResolvedValue(null);

    await expect(service.report(report())).rejects.toBeInstanceOf(IngestNotFound);
    expect(detections.create).not.toHaveBeenCalled();
  });

  it("logs a deletion failure without losing the result", async () => {
    writeChunk();
    vi.spyOn(fs.promises, "unlink").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" })
    );

    await expect(service.report(report())).resolves.toBeTruthy();
  });
});

// ─── the reaper ───────────────────────────────────────────────────────────────

describe("reapStalled()", () => {
  it("does nothing when nothing is stale", async () => {
    expect(await service.reapStalled()).toEqual({
      examined: 0,
      failed: 0,
      neverClaimed: 0,
    });
  });

  it("fails a chunk nothing ever picked up", async () => {
    ingests.listStale.mockResolvedValue([row({ status: "received" })]);

    const summary = await service.reapStalled();

    expect(summary).toMatchObject({ failed: 1, neverClaimed: 1 });
    expect(ingests.transitionStatus).toHaveBeenCalledWith(
      "ingest-1",
      "failed",
      ["received"],
      expect.stringContaining("never claimed")
    );
  });

  it("fails a chunk a worker took and abandoned", async () => {
    ingests.listStale.mockResolvedValue([row({ status: "processing" })]);

    const summary = await service.reapStalled();

    expect(summary).toMatchObject({ failed: 1, neverClaimed: 0 });
    expect(ingests.transitionStatus).toHaveBeenCalledWith(
      "ingest-1",
      "failed",
      ["processing"],
      expect.stringContaining("abandoned")
    );
  });

  it("releases the file of everything it writes off", async () => {
    const chunk = writeChunk();
    ingests.listStale.mockResolvedValue([row({ status: "processing" })]);

    await service.reapStalled();

    expect(fs.existsSync(chunk)).toBe(false);
  });

  it("leaves a chunk alone that finished just before the deadline", async () => {
    // The status guard is what makes this safe beside a live worker.
    const chunk = writeChunk();
    ingests.listStale.mockResolvedValue([row({ status: "processing" })]);
    ingests.transitionStatus.mockResolvedValue(null);

    const summary = await service.reapStalled();

    expect(summary).toMatchObject({ examined: 1, failed: 0 });
    expect(fs.existsSync(chunk)).toBe(true);
  });

  it("looks back by the configured stall window", async () => {
    process.env.AUDIO_INGEST_STALL_MINUTES = "30";
    const now = Date.UTC(2026, 8, 20, 12, 0, 0);

    await service.reapStalled(now);

    const cutoff = ingests.listStale.mock.calls[0][0] as Date;
    expect(now - cutoff.getTime()).toBe(30 * 60_000);
  });
});

describe("configuration", () => {
  it("defaults to a ten minute stall and a five minute sweep", () => {
    delete process.env.AUDIO_INGEST_STALL_MINUTES;
    delete process.env.AUDIO_INGEST_REAP_INTERVAL_MINUTES;

    expect(stalledAfterMs()).toBe(10 * 60_000);
    expect(reapIntervalMs()).toBe(5 * 60_000);
  });

  it.each(["0", "-1", "nonsense"])(
    "falls back to the default for %o rather than reaping everything",
    (value) => {
      // A zero stall window would fail every in-flight chunk immediately.
      process.env.AUDIO_INGEST_STALL_MINUTES = value;
      expect(stalledAfterMs()).toBe(10 * 60_000);
    }
  );

  it("reads both intervals from the environment", () => {
    process.env.AUDIO_INGEST_STALL_MINUTES = "30";
    process.env.AUDIO_INGEST_REAP_INTERVAL_MINUTES = "2";

    expect(stalledAfterMs()).toBe(30 * 60_000);
    expect(reapIntervalMs()).toBe(2 * 60_000);
  });

  it.each(["0", "nonsense"])(
    "falls back to the default sweep interval for %o",
    (value) => {
      process.env.AUDIO_INGEST_REAP_INTERVAL_MINUTES = value;
      expect(reapIntervalMs()).toBe(5 * 60_000);
    }
  );
});

describe("reapTick()", () => {
  it("reaps on the first tick", async () => {
    await reapTick(1_000_000);
    expect(ingests.listStale).toHaveBeenCalled();
  });

  it("does nothing again until the interval has elapsed", async () => {
    await reapTick(1_000_000);
    ingests.listStale.mockClear();

    await reapTick(1_000_000 + 60_000);

    expect(ingests.listStale).not.toHaveBeenCalled();
  });

  it("reaps again once the interval has elapsed", async () => {
    await reapTick(1_000_000);
    ingests.listStale.mockClear();

    await reapTick(1_000_000 + reapIntervalMs() + 1);

    expect(ingests.listStale).toHaveBeenCalled();
  });

  it("survives a reap that throws", async () => {
    // A failed reap costs disk and accuracy, never availability.
    ingests.listStale.mockRejectedValue(new Error("database is down"));

    await expect(reapTick(1_000_000)).resolves.toBeUndefined();
  });

  it("reports what it wrote off", async () => {
    ingests.listStale.mockResolvedValue([row({ status: "received" })]);
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});

    await reapTick(1_000_000);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining("1 stalled ingest"));
  });
});

describe("startIngestReaper()", () => {
  const GUARD = "__groovenetIngestReaperStarted";
  let timers: ReturnType<typeof setInterval>[];
  const realSetInterval = globalThis.setInterval;

  beforeEach(() => {
    timers = [];
    delete (globalThis as Record<string, unknown>)[GUARD];
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      const handle = realSetInterval(fn, ms);
      timers.push(handle);
      return handle;
    }) as typeof setInterval);
  });

  afterEach(() => {
    for (const handle of timers) clearInterval(handle);
    delete (globalThis as Record<string, unknown>)[GUARD];
  });

  it("starts only once per process", () => {
    startIngestReaper();
    startIngestReaper();

    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("ticks every minute", () => {
    startIngestReaper();

    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("reaps immediately rather than waiting out the first interval", async () => {
    startIngestReaper();

    await vi.waitFor(() => expect(ingests.listStale).toHaveBeenCalled());
  });

  it("hands the timer a callback that reaps", async () => {
    startIngestReaper();
    const registered = (globalThis.setInterval as unknown as {
      mock: { calls: [() => void, number][] };
    }).mock.calls[0][0];
    await vi.waitFor(() => expect(ingests.listStale).toHaveBeenCalled());
    ingests.listStale.mockClear();
    resetReapClock();

    registered();

    await vi.waitFor(() => expect(ingests.listStale).toHaveBeenCalled());
  });
});
