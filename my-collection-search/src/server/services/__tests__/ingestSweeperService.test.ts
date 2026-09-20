/**
 * Retention sweeper selection logic (#269).
 *
 * The rule with teeth is the one about *not* deleting: a chunk being written or
 * decoded right now must survive every other pressure, because handing a
 * half-file to the matcher produces a confident answer about the wrong audio.
 * Most of this file is about that.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repo = vi.hoisted(() => ({ findByFilePaths: vi.fn() }));
vi.mock("@/server/repositories/audioIngestRepository", () => ({
  audioIngestRepository: repo,
}));

import {
  ensureIngestDir,
  startIngestSweeper,
  getRetentionStatus,
  ingestDir,
  loadRetentionPolicy,
  resetSweepClock,
  selectForDeletion,
  sweepIngestDirectory,
  sweepTick,
} from "../ingestSweeperService";
import type { AudioIngestRow, AudioIngestStatus } from "@/server/repositories/audioIngestRepository";
import type { IngestRetentionPolicy, SweepCandidate } from "@/types/audioIngest";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 3_600_000;

const policy: IngestRetentionPolicy = {
  maxAgeHours: 24,
  maxBytes: 1_000_000,
  orphanGraceMinutes: 60,
  sweepIntervalMinutes: 15,
};

function file(name: string, ageMs = 0, bytes = 1000): SweepCandidate {
  return { fileName: name, bytes, modifiedAt: NOW - ageMs };
}

function record(fileName: string, status: AudioIngestStatus): AudioIngestRow {
  return {
    id: `id-${fileName}`,
    source_id: "living-room-vinyl",
    session_id: null,
    sequence: null,
    captured_at: null,
    received_at: new Date(NOW).toISOString(),
    duration_seconds: 15,
    sample_rate: 44100,
    channels: 1,
    codec: "pcm_s16le",
    file_path: fileName,
    status,
    error: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
  };
}

function decide(candidates: SweepCandidate[], records: AudioIngestRow[] = [], p = policy) {
  const decisions = selectForDeletion(candidates, records, NOW, p);
  return new Map(decisions.map((d) => [d.fileName, d]));
}

// ─── the protection rule ──────────────────────────────────────────────────────

describe("selectForDeletion() — files still in flight", () => {
  it.each<AudioIngestStatus>(["received", "processing"])(
    "spares a %s file",
    (status) => {
      const d = decide([file("chunk.wav")], [record("chunk.wav", status)]);
      expect(d.get("chunk.wav")).toMatchObject({ deleted: false, reason: "in-flight" });
    }
  );

  it("spares an in-flight file even when the volume is over budget", () => {
    // Running out of disk is bad; corrupting the chunk being fingerprinted is
    // worse. A volume full of live uploads is something to alert on.
    const d = decide(
      [file("live.wav", 0, 5_000_000)],
      [record("live.wav", "processing")],
      { ...policy, maxBytes: 1000 }
    );
    expect(d.get("live.wav")).toMatchObject({ deleted: false, reason: "in-flight" });
  });

  it("sweeps an in-flight file that has outlived the max age", () => {
    // The backstop for a worker that died mid-job: nothing legitimately holds a
    // 15-second chunk in `processing` for a day.
    const d = decide([file("wedged.wav", 25 * HOUR)], [record("wedged.wav", "processing")]);
    expect(d.get("wedged.wav")).toMatchObject({ deleted: true, reason: "expired" });
  });

  it("keeps protecting an in-flight file right up to the max age", () => {
    const d = decide([file("slow.wav", 23 * HOUR)], [record("slow.wav", "processing")]);
    expect(d.get("slow.wav")).toMatchObject({ deleted: false, reason: "in-flight" });
  });
});

// ─── terminal records ─────────────────────────────────────────────────────────

describe("selectForDeletion() — finished work", () => {
  it.each<AudioIngestStatus>(["processed", "failed"])(
    "sweeps a %s file immediately",
    (status) => {
      const d = decide([file("done.wav")], [record("done.wav", status)]);
      expect(d.get("done.wav")).toMatchObject({ deleted: true, reason: "terminal" });
    }
  );

  it("sweeps a failed file too — the error lives on the record", () => {
    const d = decide([file("bad.wav")], [record("bad.wav", "failed")]);
    expect(d.get("bad.wav")?.deleted).toBe(true);
  });

  it("matches a record whose file_path carries a directory", () => {
    // The worker resolves paths against the volume root; a record may hold
    // either form.
    const withDir = { ...record("chunk.wav", "processed"), file_path: "2026-09-20/chunk.wav" };
    const d = decide([file("chunk.wav")], [withDir]);
    expect(d.get("chunk.wav")?.deleted).toBe(true);
  });
});

// ─── orphans ──────────────────────────────────────────────────────────────────

describe("selectForDeletion() — files with no record", () => {
  it("spares a brand-new orphan", () => {
    // The route writes the file, then inserts the row. For that instant every
    // legitimate upload looks exactly like an orphan.
    const d = decide([file("fresh.wav", 5 * MINUTE)]);
    expect(d.get("fresh.wav")).toMatchObject({ deleted: false, reason: "within-grace" });
  });

  it("sweeps an orphan past the grace period", () => {
    const d = decide([file("stale.wav", 2 * HOUR)]);
    expect(d.get("stale.wav")).toMatchObject({ deleted: true, reason: "orphaned" });
  });

  it("sweeps exactly at the grace boundary", () => {
    const d = decide([file("edge.wav", 60 * MINUTE)]);
    expect(d.get("edge.wav")?.deleted).toBe(true);
  });

  it("never waits longer than the max age, even if grace is misconfigured", () => {
    // grace > maxAge would otherwise let orphans outlive the retention cap.
    const d = decide([file("orphan.wav", 2 * HOUR)], [], {
      ...policy,
      maxAgeHours: 1,
      orphanGraceMinutes: 60 * 24 * 7,
    });
    expect(d.get("orphan.wav")?.deleted).toBe(true);
  });
});

// ─── size budget ──────────────────────────────────────────────────────────────

describe("selectForDeletion() — size budget", () => {
  it("leaves everything alone under budget", () => {
    const d = decide([file("a.wav", 5 * MINUTE, 100), file("b.wav", 5 * MINUTE, 100)]);
    expect([...d.values()].every((x) => !x.deleted)).toBe(true);
  });

  it("evicts the oldest first when over budget", () => {
    const d = decide(
      [
        file("old.wav", 30 * MINUTE, 800),
        file("new.wav", 1 * MINUTE, 800),
      ],
      [],
      { ...policy, maxBytes: 1000 }
    );

    expect(d.get("old.wav")).toMatchObject({ deleted: true, reason: "over-budget" });
    expect(d.get("new.wav")?.deleted).toBe(false);
  });

  it("stops evicting as soon as it is under budget", () => {
    const d = decide(
      [
        file("a.wav", 30 * MINUTE, 400),
        file("b.wav", 20 * MINUTE, 400),
        file("c.wav", 10 * MINUTE, 400),
      ],
      [],
      { ...policy, maxBytes: 1000 }
    );

    const deleted = [...d.values()].filter((x) => x.deleted).map((x) => x.fileName);
    expect(deleted).toEqual(["a.wav"]);
  });

  it("counts already-doomed files toward the budget before evicting more", () => {
    // A terminal file is going anyway; it should not also cost a live one.
    const d = decide(
      [file("done.wav", 1 * MINUTE, 900), file("fresh.wav", 1 * MINUTE, 400)],
      [record("done.wav", "processed")],
      { ...policy, maxBytes: 1000 }
    );

    expect(d.get("done.wav")?.reason).toBe("terminal");
    expect(d.get("fresh.wav")?.deleted).toBe(false);
  });
});

describe("selectForDeletion() — empties", () => {
  it("handles an empty directory", () => {
    expect(selectForDeletion([], [], NOW, policy)).toEqual([]);
  });

  it("ignores a record whose file_path is null", () => {
    const orphanRecord = { ...record("x.wav", "processed"), file_path: null };
    const d = decide([file("x.wav", 2 * HOUR)], [orphanRecord]);
    // No usable path to match on, so the file is judged on its own age.
    expect(d.get("x.wav")).toMatchObject({ deleted: true, reason: "orphaned" });
  });
});

// ─── policy from the environment ──────────────────────────────────────────────

describe("loadRetentionPolicy()", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to a day and 2 GiB", () => {
    delete process.env.AUDIO_INGEST_MAX_AGE_HOURS;
    delete process.env.AUDIO_INGEST_MAX_BYTES;
    delete process.env.AUDIO_INGEST_ORPHAN_GRACE_MINUTES;
    delete process.env.AUDIO_INGEST_SWEEP_INTERVAL_MINUTES;

    expect(loadRetentionPolicy()).toEqual({
      maxAgeHours: 24,
      maxBytes: 2 * 1024 * 1024 * 1024,
      orphanGraceMinutes: 60,
      sweepIntervalMinutes: 15,
    });
  });

  it("reads the environment", () => {
    process.env.AUDIO_INGEST_MAX_AGE_HOURS = "6";
    process.env.AUDIO_INGEST_MAX_BYTES = "1024";
    process.env.AUDIO_INGEST_ORPHAN_GRACE_MINUTES = "5";
    process.env.AUDIO_INGEST_SWEEP_INTERVAL_MINUTES = "1";

    expect(loadRetentionPolicy()).toMatchObject({
      maxAgeHours: 6,
      maxBytes: 1024,
      orphanGraceMinutes: 5,
      sweepIntervalMinutes: 1,
    });
  });

  it.each(["0", "-1", "nonsense", ""])(
    "falls back to the default for %o rather than sweeping everything",
    (value) => {
      // A zero or negative max age would make every file instantly expired.
      process.env.AUDIO_INGEST_MAX_AGE_HOURS = value;
      expect(loadRetentionPolicy().maxAgeHours).toBe(24);
    }
  );
});

// ─── against a real directory ─────────────────────────────────────────────────

describe("sweepIngestDirectory() (real temp directory)", () => {
  let dir: string;
  const saved = { ...process.env };

  function write(name: string, bytes: number, ageMs = 0): void {
    const target = path.join(dir, name);
    fs.writeFileSync(target, Buffer.alloc(bytes));
    const when = new Date(NOW - ageMs);
    fs.utimesSync(target, when, when);
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-sweep-"));
    process.env.AUDIO_INGEST_DIR = dir;
    repo.findByFilePaths.mockReset().mockResolvedValue([]);
    resetSweepClock();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it("deletes what it selected and leaves the rest", async () => {
    write("done.wav", 100);
    write("live.wav", 100);
    write("fresh.wav", 100, 1 * MINUTE);
    repo.findByFilePaths.mockResolvedValue([
      record("done.wav", "processed"),
      record("live.wav", "processing"),
    ]);

    const summary = await sweepIngestDirectory(policy, NOW);

    expect(summary).toMatchObject({ scanned: 3, deleted: 1, bytesReclaimed: 100, spared: 2 });
    expect(fs.existsSync(path.join(dir, "done.wav"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "live.wav"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "fresh.wav"))).toBe(true);
  });

  it("is idempotent — a second sweep finds nothing to do", async () => {
    write("done.wav", 100);
    repo.findByFilePaths.mockResolvedValue([record("done.wav", "processed")]);

    const first = await sweepIngestDirectory(policy, NOW);
    repo.findByFilePaths.mockResolvedValue([]);
    const second = await sweepIngestDirectory(policy, NOW);

    expect(first.deleted).toBe(1);
    expect(second).toMatchObject({ scanned: 0, deleted: 0 });
  });

  it("tolerates a file that vanished mid-sweep", async () => {
    // Another sweeper, or the app's own cleanup, got there first.
    write("racing.wav", 100);
    repo.findByFilePaths.mockResolvedValue([record("racing.wav", "processed")]);
    const unlink = vi.spyOn(fsp, "unlink").mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const summary = await sweepIngestDirectory(policy, NOW);

    expect(summary.errors).toEqual([]);
    expect(summary.deleted).toBe(0);
    unlink.mockRestore();
  });

  it("records a deletion failure without aborting the sweep", async () => {
    write("locked.wav", 100);
    write("done.wav", 100);
    repo.findByFilePaths.mockResolvedValue([
      record("locked.wav", "processed"),
      record("done.wav", "processed"),
    ]);
    vi.spyOn(fsp, "unlink").mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
    );

    const summary = await sweepIngestDirectory(policy, NOW);

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain("permission denied");
    expect(summary.deleted).toBe(1); // the other one still went
    vi.restoreAllMocks();
  });

  it("ignores subdirectories", async () => {
    fs.mkdirSync(path.join(dir, "nested"));
    write("done.wav", 100);
    repo.findByFilePaths.mockResolvedValue([record("done.wav", "processed")]);

    const summary = await sweepIngestDirectory(policy, NOW);

    expect(summary.scanned).toBe(1);
    expect(fs.existsSync(path.join(dir, "nested"))).toBe(true);
  });

  it("treats a missing directory as empty rather than throwing", async () => {
    fs.rmSync(dir, { recursive: true, force: true });

    await expect(sweepIngestDirectory(policy, NOW)).resolves.toMatchObject({
      scanned: 0,
      deleted: 0,
    });
  });

  it("never queries the database for an empty directory", async () => {
    await sweepIngestDirectory(policy, NOW);
    expect(repo.findByFilePaths).not.toHaveBeenCalled();
  });

  // ── status ──

  it("reports usage without deleting anything", async () => {
    write("done.wav", 100);
    write("live.wav", 200);
    write("orphan.wav", 300, 2 * HOUR);
    repo.findByFilePaths.mockResolvedValue([
      record("done.wav", "processed"),
      record("live.wav", "processing"),
    ]);

    const status = await getRetentionStatus(policy, NOW);

    expect(status).toMatchObject({
      files: 3,
      bytes: 600,
      sweepable: 2, // done + orphan
      orphans: 1,
      inFlight: 1,
    });
    expect(fs.existsSync(path.join(dir, "done.wav"))).toBe(true);
  });

  // ── the tick ──

  it("sweeps on the first tick", async () => {
    write("done.wav", 100);
    repo.findByFilePaths.mockResolvedValue([record("done.wav", "processed")]);

    await sweepTick(NOW);

    expect(fs.existsSync(path.join(dir, "done.wav"))).toBe(false);
  });

  it("does nothing again until the interval has elapsed", async () => {
    await sweepTick(NOW);
    repo.findByFilePaths.mockClear();

    write("done.wav", 100);
    await sweepTick(NOW + 60_000); // one minute later, interval is fifteen

    expect(repo.findByFilePaths).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dir, "done.wav"))).toBe(true);
  });

  it("sweeps again once the interval has elapsed", async () => {
    await sweepTick(NOW);
    write("done.wav", 100);
    repo.findByFilePaths.mockResolvedValue([record("done.wav", "processed")]);

    await sweepTick(NOW + 16 * MINUTE);

    expect(fs.existsSync(path.join(dir, "done.wav"))).toBe(false);
  });

  it("survives a sweep that throws", async () => {
    // A failed sweep costs disk space, never availability.
    write("done.wav", 100);
    repo.findByFilePaths.mockRejectedValue(new Error("database is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sweepTick(NOW)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  // ── startup ──

  it("creates the ingest directory when it is missing", async () => {
    fs.rmSync(dir, { recursive: true, force: true });

    expect(ensureIngestDir()).toBe(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("is happy when the directory already exists", () => {
    expect(() => ensureIngestDir()).not.toThrow();
  });

  it("resolves the directory from the environment", () => {
    expect(ingestDir()).toBe(dir);
  });
});

// ─── directory-listing edge cases ─────────────────────────────────────────────

describe("sweepIngestDirectory() — listing failures", () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-list-"));
    process.env.AUDIO_INGEST_DIR = dir;
    repo.findByFilePaths.mockReset().mockResolvedValue([]);
    resetSweepClock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it("rethrows a directory it cannot read", async () => {
    // Distinct from a missing directory: an unreadable volume is a real fault
    // and must not be reported as "nothing to sweep".
    vi.spyOn(fsp, "readdir").mockRejectedValue(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
    );

    await expect(sweepIngestDirectory(policy, NOW)).rejects.toThrow("permission denied");
  });

  it("skips a file that vanished between listing and stat", async () => {
    fs.writeFileSync(path.join(dir, "a.wav"), Buffer.alloc(10));
    fs.writeFileSync(path.join(dir, "b.wav"), Buffer.alloc(10));
    vi.spyOn(fsp, "stat").mockRejectedValueOnce(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const summary = await sweepIngestDirectory(policy, NOW);

    expect(summary.scanned).toBe(1);
  });

  it("rethrows a stat failure that is not a missing file", async () => {
    fs.writeFileSync(path.join(dir, "a.wav"), Buffer.alloc(10));
    vi.spyOn(fsp, "stat").mockRejectedValue(
      Object.assign(new Error("EIO: i/o error"), { code: "EIO" })
    );

    await expect(sweepIngestDirectory(policy, NOW)).rejects.toThrow("i/o error");
  });

  it("logs each deletion failure on the tick", async () => {
    fs.writeFileSync(path.join(dir, "locked.wav"), Buffer.alloc(10));
    repo.findByFilePaths.mockResolvedValue([record("locked.wav", "processed")]);
    vi.spyOn(fsp, "unlink").mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" })
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    await sweepTick(NOW);

    expect(logged).toHaveBeenCalledWith("[ingest-sweeper]", expect.stringContaining("locked.wav"));
  });
});

// ─── the scheduler ────────────────────────────────────────────────────────────

// Captured before any spy replaces it.
const timerImpl = globalThis.setInterval;

describe("startIngestSweeper()", () => {
  let dir: string;
  const saved = { ...process.env };
  const GUARD = "__groovenetIngestSweeperStarted";

  let timers: ReturnType<typeof setInterval>[];

  beforeEach(() => {
    dir = path.join(os.tmpdir(), `ingest-start-${Math.random().toString(36).slice(2)}`);
    process.env.AUDIO_INGEST_DIR = dir;
    repo.findByFilePaths.mockReset().mockResolvedValue([]);
    resetSweepClock();
    delete (globalThis as Record<string, unknown>)[GUARD];
    timers = [];
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Remember every timer the sweeper registers. One test runs on real timers,
    // and a stray 60s interval would keep the suite's event loop alive.
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      const handle = timerImpl(fn, ms);
      timers.push(handle);
      return handle;
    }) as typeof setInterval);
  });

  afterEach(() => {
    for (const handle of timers) clearInterval(handle);
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>)[GUARD];
    fs.rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it("creates the ingest directory on startup", () => {
    startIngestSweeper();

    expect(fs.existsSync(dir)).toBe(true);
  });

  it("starts only once per process", () => {
    startIngestSweeper();
    startIngestSweeper();

    expect(globalThis.setInterval).toHaveBeenCalledTimes(1);
  });

  it("ticks every minute", () => {
    startIngestSweeper();

    expect(globalThis.setInterval).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("hands the timer a callback that sweeps", async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "done.wav"), Buffer.alloc(10));
    startIngestSweeper();

    const registered = (globalThis.setInterval as unknown as {
      mock: { calls: [() => void, number][] };
    }).mock.calls[0][0];
    repo.findByFilePaths.mockClear();
    resetSweepClock();
    vi.useRealTimers();

    registered();

    await vi.waitFor(() => expect(repo.findByFilePaths).toHaveBeenCalled());
  });

  it("keeps running when the directory cannot be created", () => {
    // A read-only volume should not take the app down on boot.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
      throw new Error("EROFS: read-only file system");
    });

    expect(() => startIngestSweeper()).not.toThrow();
    expect(logged).toHaveBeenCalledWith(
      "[ingest-sweeper] could not create the ingest directory:",
      expect.any(Error)
    );
  });

  it("sweeps on startup rather than waiting out the first interval", async () => {
    // Real timers here: the sweep ends in `fsp.readdir`, which is real disk I/O
    // and cannot be flushed by advancing a fake clock. The 60s interval will
    // not fire during the test; it is cleared in the afterEach below.
    vi.useRealTimers();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "done.wav"), Buffer.alloc(10));

    startIngestSweeper();

    await vi.waitFor(() =>
      expect(repo.findByFilePaths).toHaveBeenCalledWith(["done.wav"])
    );
  });
});
