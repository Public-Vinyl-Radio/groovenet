import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FingerprintIndexService,
  NoFingerprintEngineError,
  INDEX_QUEUE_KEY,
  ENGINE_KEY,
  runKey,
} from "../fingerprintIndexService";

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockPipeline = vi.hoisted(() => ({
  lpush: vi.fn(),
  exec: vi.fn(),
}));

const mockMulti = vi.hoisted(() => ({
  hset: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  hgetall: vi.fn(),
  lrange: vi.fn(),
  pipeline: vi.fn(),
  multi: vi.fn(),
}));

const repo = vi.hoisted(() => ({
  listIndexCandidates: vi.fn(),
  countUnindexableTracks: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => mockRedis }));
vi.mock("@/server/repositories/fingerprintRepository", () => ({
  fingerprintRepository: repo,
}));
vi.mock("crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("crypto")>()),
  randomUUID: () => "run-1",
}));

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPipeline.lpush.mockReturnValue(mockPipeline);
  mockPipeline.exec.mockResolvedValue([]);
  mockMulti.hset.mockReturnValue(mockMulti);
  mockMulti.expire.mockReturnValue(mockMulti);
  mockMulti.exec.mockResolvedValue([]);
  mockRedis.pipeline.mockReturnValue(mockPipeline);
  mockRedis.multi.mockReturnValue(mockMulti);
  mockRedis.lrange.mockResolvedValue([]);
  repo.countUnindexableTracks.mockResolvedValue(0);
  repo.listIndexCandidates.mockResolvedValue([]);
});

function makeService() {
  return new FingerprintIndexService();
}

function engineRegistered() {
  mockRedis.hgetall.mockResolvedValue({
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
  });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "t1",
    friend_id: 1,
    local_audio_url: "artist - title.m4a",
    stored_audio_sha256: null,
    stored_audio_size_bytes: null,
    stored_audio_mtime_ms: null,
    ...overrides,
  };
}

function queuedJobs(): Array<Record<string, unknown>> {
  return mockPipeline.lpush.mock.calls.map(
    (call) => JSON.parse(call[1] as string) as Record<string, unknown>
  );
}

// ─── getEngine ────────────────────────────────────────────────────────────────

describe("getEngine()", () => {
  it("reads what the worker advertised", async () => {
    engineRegistered();

    expect(await makeService().getEngine()).toEqual({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });
    expect(mockRedis.hgetall).toHaveBeenCalledWith(ENGINE_KEY);
  });

  it("returns null when nothing is advertised", async () => {
    // The key carries the heartbeat's TTL, so a stopped worker stops
    // advertising rather than leaving a stale identity behind.
    mockRedis.hgetall.mockResolvedValue({});
    expect(await makeService().getEngine()).toBeNull();
  });

  it("returns null on a half-written identity", async () => {
    mockRedis.hgetall.mockResolvedValue({ fingerprint_type: "chromaprint" });
    expect(await makeService().getEngine()).toBeNull();
  });
});

// ─── startRun ─────────────────────────────────────────────────────────────────

describe("startRun()", () => {
  it("refuses to run with no engine registered", async () => {
    mockRedis.hgetall.mockResolvedValue({});

    await expect(makeService().startRun({ kind: "missing" })).rejects.toThrow(
      NoFingerprintEngineError
    );
    expect(mockPipeline.lpush).not.toHaveBeenCalled();
  });

  it("queues one job per candidate", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([
      candidate({ track_id: "t1" }),
      candidate({ track_id: "t2" }),
    ]);

    const run = await makeService().startRun({ kind: "missing" });

    expect(run.queued).toBe(2);
    expect(mockPipeline.lpush).toHaveBeenCalledTimes(2);
    expect(mockPipeline.lpush.mock.calls[0][0]).toBe(INDEX_QUEUE_KEY);
  });

  it("stamps each job with the stored hash so the worker can decide alone", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([
      candidate({ stored_audio_sha256: "a".repeat(64) }),
    ]);

    await makeService().startRun({ kind: "changed" });

    expect(queuedJobs()[0]).toMatchObject({
      run_id: "run-1",
      track_id: "t1",
      friend_id: 1,
      file_path: "artist - title.m4a",
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      stored_audio_sha256: "a".repeat(64),
      force: false,
    });
  });

  it("stamps each job with the stored size and mtime, so an untouched file needs no hash (#303)", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([
      candidate({
        stored_audio_sha256: "a".repeat(64),
        stored_audio_size_bytes: 41_234_567,
        stored_audio_mtime_ms: 1_790_000_000_000,
      }),
      candidate({ track_id: "t2" }),
    ]);

    await makeService().startRun({ kind: "changed" });

    expect(queuedJobs()[0]).toMatchObject({
      stored_audio_size_bytes: 41_234_567,
      stored_audio_mtime_ms: 1_790_000_000_000,
    });
    // A row fingerprinted before these were recorded carries nulls: hashed as before.
    expect(queuedJobs()[1]).toMatchObject({ stored_audio_size_bytes: null, stored_audio_mtime_ms: null });
  });

  it("forces regeneration for --all", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([candidate()]);

    await makeService().startRun({ kind: "all" }, { force: true });

    expect(queuedJobs()[0].force).toBe(true);
  });

  it("seeds the run counters before queueing anything", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([candidate()]);
    repo.countUnindexableTracks.mockResolvedValue(241);

    await makeService().startRun({ kind: "missing" });

    const seeded = mockMulti.hset.mock.calls[0][1] as Record<string, string>;
    expect(mockMulti.hset.mock.calls[0][0]).toBe(runKey("run-1"));
    expect(seeded).toMatchObject({
      run_id: "run-1",
      scope: "missing",
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      queued: "1",
      unindexable: "241",
    });
    // A fast worker must not increment a counter on a run whose size the status
    // endpoint does not yet know.
    expect(mockMulti.exec).toHaveBeenCalled();
    expect(mockMulti.exec.mock.invocationCallOrder[0]).toBeLessThan(
      mockPipeline.exec.mock.invocationCallOrder[0]
    );
  });

  it("reports unindexable tracks without queueing them", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue([]);
    repo.countUnindexableTracks.mockResolvedValue(241);

    const run = await makeService().startRun({ kind: "all" });

    expect(run.unindexable).toBe(241);
    expect(run.queued).toBe(0);
    expect(mockPipeline.lpush).not.toHaveBeenCalled();
  });

  it("is already complete when there is nothing to do", async () => {
    engineRegistered();

    const run = await makeService().startRun({ kind: "missing" });

    expect(run.complete).toBe(true);
  });

  it("describes a narrowed scope in the run", async () => {
    engineRegistered();

    const track = await makeService().startRun({ kind: "track", track_id: "t1" });
    const release = await makeService().startRun({
      kind: "release",
      release_id: "r9",
    });

    expect(track.scope).toBe("track:t1");
    expect(release.scope).toBe("release:r9");
  });

  it("batches a large library instead of one giant pipeline", async () => {
    engineRegistered();
    repo.listIndexCandidates.mockResolvedValue(
      Array.from({ length: 1200 }, (_, i) => candidate({ track_id: `t${i}` }))
    );

    const run = await makeService().startRun({ kind: "all" });

    expect(run.queued).toBe(1200);
    expect(mockPipeline.lpush).toHaveBeenCalledTimes(1200);
    expect(mockRedis.pipeline).toHaveBeenCalledTimes(3); // 500 + 500 + 200
  });
});

// ─── getRun ───────────────────────────────────────────────────────────────────

describe("getRun()", () => {
  it("returns null for an unknown or expired run", async () => {
    mockRedis.hgetall.mockResolvedValue({});
    expect(await makeService().getRun("run-1")).toBeNull();
  });

  it("reads the counters the worker left", async () => {
    mockRedis.hgetall.mockResolvedValue({
      run_id: "run-1",
      scope: "missing",
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      queued: "10",
      unindexable: "241",
      indexed: "7",
      skipped: "1",
      failed: "1",
      started_at: "1000",
      updated_at: "2000",
    });
    mockRedis.lrange.mockResolvedValue(["t3: decode failed"]);

    const run = await makeService().getRun("run-1");

    expect(run).toMatchObject({
      queued: 10,
      unindexable: 241,
      indexed: 7,
      skipped: 1,
      failed: 1,
      errors: ["t3: decode failed"],
      complete: false,
    });
  });

  it("is complete once every queued track reached a terminal state", async () => {
    mockRedis.hgetall.mockResolvedValue({
      run_id: "run-1",
      queued: "3",
      indexed: "1",
      skipped: "1",
      failed: "1",
    });

    expect((await makeService().getRun("run-1"))?.complete).toBe(true);
  });

  it("falls back to the requested id and empty fields on a partial hash", async () => {
    // A run seeded by an older version, or caught mid-write.
    mockRedis.hgetall.mockResolvedValue({ queued: "1", indexed: "1" });

    const run = await makeService().getRun("run-7");

    expect(run).toMatchObject({
      run_id: "run-7",
      scope: "",
      fingerprint_type: "",
      fingerprint_version: "",
      complete: true,
    });
  });

  it("survives an errors list that came back empty", async () => {
    mockRedis.hgetall.mockResolvedValue({ run_id: "run-1", queued: "0" });
    mockRedis.lrange.mockResolvedValue(null);

    expect((await makeService().getRun("run-1"))?.errors).toEqual([]);
  });

  it("treats a non-numeric counter as zero", async () => {
    // Nothing should write this, but a counter that parses to NaN must not
    // become NaN in the summary the CLI prints.
    mockRedis.hgetall.mockResolvedValue({
      run_id: "run-1",
      queued: "not-a-number",
      indexed: "1",
    });

    const run = await makeService().getRun("run-1");

    expect(run?.queued).toBe(0);
    expect(run?.indexed).toBe(1);
  });

  it("treats absent counters as zero", async () => {
    mockRedis.hgetall.mockResolvedValue({ run_id: "run-1", queued: "2" });

    const run = await makeService().getRun("run-1");

    expect(run).toMatchObject({ indexed: 0, skipped: 0, failed: 0, complete: false });
  });
});
