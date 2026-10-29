import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisJobService } from "../redisJobService";

// ─── mocks ────────────────────────────────────────────────────────────────────

const mockPipeline = vi.hoisted(() => ({
  hset: vi.fn(),
  zadd: vi.fn(),
  expire: vi.fn(),
  hgetall: vi.fn(),
  del: vi.fn(),
  zrem: vi.fn(),
  exec: vi.fn(),
}));

const mockRedis = vi.hoisted(() => ({
  scan: vi.fn(),
  hgetall: vi.fn(),
  pipeline: vi.fn(),
  lrange: vi.fn(),
  lpush: vi.fn(),
  zrangebyscore: vi.fn(),
  zrem: vi.fn(),
  del: vi.fn(),
}));

const settingsRepo = vi.hoisted(() => ({
  ensureGamdlSettings: vi.fn(),
  findGamdlSettingsByFriendId: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedisConnection: () => mockRedis }));

vi.mock("@/server/repositories/settingsRepository", () => ({
  settingsRepository: settingsRepo,
}));

// Deterministic UUIDs so job IDs are assertable
vi.mock("uuid", () => ({ v4: vi.fn(() => "test-job-id") }));

// ─── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Pipeline chains return this, exec returns empty by default
  mockPipeline.hset.mockReturnThis();
  mockPipeline.zadd.mockReturnThis();
  mockPipeline.expire.mockReturnThis();
  mockPipeline.hgetall.mockReturnThis();
  mockPipeline.del.mockReturnThis();
  mockPipeline.zrem.mockReturnThis();
  mockPipeline.exec.mockResolvedValue([]);

  mockRedis.pipeline.mockReturnValue(mockPipeline);
  mockRedis.lrange.mockResolvedValue([]);
  mockRedis.lpush.mockResolvedValue(1);
  mockRedis.scan.mockResolvedValue(["0", []]);
  mockRedis.hgetall.mockResolvedValue({});
  mockRedis.zrangebyscore.mockResolvedValue([]);
  mockRedis.del.mockResolvedValue(0);
  mockRedis.zrem.mockResolvedValue(0);

  settingsRepo.ensureGamdlSettings.mockResolvedValue(undefined);
  settingsRepo.findGamdlSettingsByFriendId.mockResolvedValue(null);
});

function makeService() {
  return new RedisJobService();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeJobHash(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    job_id: "test-job-id",
    status: "queued",
    progress: "0",
    created_at: "1700000000000",
    updated_at: "1700000000000",
    track_id: "t1",
    friend_id: "1",
    job_type: "download",
    name: "download-audio",
    ...overrides,
  };
}

// ─── createDurationJob ────────────────────────────────────────────────────────

describe("createDurationJob()", () => {
  it("returns the generated job ID", async () => {
    const jobId = await makeService().createDurationJob({
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "/audio/t1.m4a",
    });
    expect(jobId).toBe("test-job-id");
  });

  it("stores metadata via the pipeline with correct job_type", async () => {
    await makeService().createDurationJob({ track_id: "t1", friend_id: 1 });

    expect(mockPipeline.del).toHaveBeenCalledWith("job:test-job-id:logs");
    expect(mockPipeline.hset).toHaveBeenCalledWith(
      "job:test-job-id",
      expect.objectContaining({ job_type: "fix-duration", track_id: "t1" }),
    );
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it("pushes a fix-duration payload to the download queue", async () => {
    await makeService().createDurationJob({
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "/audio/t1.m4a",
    });

    expect(mockRedis.lpush).toHaveBeenCalledWith(
      "download_queue",
      expect.stringContaining('"job_type":"fix-duration"'),
    );
    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload).toMatchObject({
      job_id: "test-job-id",
      job_type: "fix-duration",
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "/audio/t1.m4a",
    });
  });

  it("omits local_audio_url from the payload when not provided", async () => {
    await makeService().createDurationJob({ track_id: "t1", friend_id: 1 });
    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload).not.toHaveProperty("local_audio_url");
  });
});

// ─── createAnalyzeLocalJob ────────────────────────────────────────────────────

describe("createAnalyzeLocalJob()", () => {
  it("returns the generated job ID", async () => {
    const jobId = await makeService().createAnalyzeLocalJob({
      track_id: "t1",
      friend_id: 1,
    });
    expect(jobId).toBe("test-job-id");
  });

  it("pushes an analyze-local payload to the download queue", async () => {
    await makeService().createAnalyzeLocalJob({
      track_id: "t1",
      friend_id: 1,
      local_audio_url: "/audio/t1.m4a",
    });

    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload).toMatchObject({
      job_type: "analyze-local",
      track_id: "t1",
      friend_id: 1,
    });
  });
});

// ─── createCoverArtAlbumJob ───────────────────────────────────────────────────

describe("createCoverArtAlbumJob()", () => {
  it("includes release_id in the queue payload", async () => {
    await makeService().createCoverArtAlbumJob({
      track_id: "t1",
      friend_id: 1,
      release_id: "r42",
    });

    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload).toMatchObject({
      job_type: "extract-cover-art-album",
      release_id: "r42",
    });
  });
});

// ─── createDownloadJob ────────────────────────────────────────────────────────

describe("createDownloadJob()", () => {
  it("fetches gamdl settings and merges them into the payload", async () => {
    settingsRepo.findGamdlSettingsByFriendId.mockResolvedValue({
      audio_quality: "lossless",
      audio_format: "flac",
      save_cover: true,
      cover_format: "png",
      save_lyrics: false,
      lyrics_format: "lrc",
      overwrite_existing: false,
      skip_music_videos: true,
      max_retries: 5,
    });

    await makeService().createDownloadJob({
      track_id: "t1",
      friend_id: 1,
      apple_music_url: "https://music.apple.com/t1",
    });

    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload.quality).toBe("lossless");
    expect(payload.format).toBe("flac");
    expect(payload.job_type).toBe("download");
  });

  it("uses hardcoded defaults when settings repository throws", async () => {
    settingsRepo.ensureGamdlSettings.mockRejectedValue(new Error("DB down"));

    await makeService().createDownloadJob({
      track_id: "t1",
      friend_id: 1,
    });

    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload.quality).toBe("best");
    expect(payload.format).toBe("m4a");
  });

  it("provided data takes precedence over fetched settings", async () => {
    settingsRepo.findGamdlSettingsByFriendId.mockResolvedValue({
      audio_quality: "standard",
      audio_format: "m4a",
    });

    await makeService().createDownloadJob({
      track_id: "t1",
      friend_id: 1,
      quality: "lossless",
    });

    const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
    expect(payload.quality).toBe("lossless");
  });
});

// ─── getJobStatus ─────────────────────────────────────────────────────────────

describe("getJobStatus()", () => {
  it("returns null when the job hash is empty", async () => {
    mockRedis.hgetall.mockResolvedValue({});
    const result = await makeService().getJobStatus("missing-id");
    expect(result).toBeNull();
  });

  it("returns a parsed JobStatus when the hash exists", async () => {
    mockRedis.hgetall.mockResolvedValue(makeJobHash({ status: "processing", progress: "42" }));

    const result = await makeService().getJobStatus("test-job-id");

    expect(result).toMatchObject({
      job_id: "test-job-id",
      status: "processing",
      progress: 42,
      track_id: "t1",
      friend_id: 1,
    });
  });

  it("queries with the correct Redis key", async () => {
    await makeService().getJobStatus("abc-123");
    expect(mockRedis.hgetall).toHaveBeenCalledWith("job:abc-123");
  });

  it("parses result JSON when present", async () => {
    mockRedis.hgetall.mockResolvedValue(
      makeJobHash({ result: JSON.stringify({ file_path: "/audio/t1.m4a" }) }),
    );
    const result = await makeService().getJobStatus("test-job-id");
    expect(result?.result).toEqual({ file_path: "/audio/t1.m4a" });
  });
});

// ─── getAllJobs ───────────────────────────────────────────────────────────────

describe("getAllJobs()", () => {
  it("returns empty array when no job keys exist", async () => {
    mockRedis.scan.mockResolvedValue(["0", []]);
    const result = await makeService().getAllJobs();
    expect(result).toEqual([]);
  });

  it("returns jobs sorted by updated_at descending", async () => {
    mockRedis.scan.mockResolvedValue(["0", ["job:a", "job:b"]]);
    mockPipeline.exec.mockResolvedValue([
      [null, makeJobHash({ job_id: "a", updated_at: "1000" })],
      [null, makeJobHash({ job_id: "b", updated_at: "2000" })],
    ]);

    const result = await makeService().getAllJobs();
    expect(result[0].job_id).toBe("b");
    expect(result[1].job_id).toBe("a");
  });

  it("applies the limit when provided", async () => {
    mockRedis.scan.mockResolvedValue(["0", ["job:a", "job:b", "job:c"]]);
    mockPipeline.exec.mockResolvedValue([
      [null, makeJobHash({ job_id: "a", updated_at: "1000" })],
      [null, makeJobHash({ job_id: "b", updated_at: "2000" })],
      [null, makeJobHash({ job_id: "c", updated_at: "3000" })],
    ]);

    const result = await makeService().getAllJobs(2);
    expect(result).toHaveLength(2);
  });

  it("skips pipeline results that have errors", async () => {
    mockRedis.scan.mockResolvedValue(["0", ["job:a", "job:b"]]);
    mockPipeline.exec.mockResolvedValue([
      [new Error("read error"), null],
      [null, makeJobHash({ job_id: "b" })],
    ]);

    const result = await makeService().getAllJobs();
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe("b");
  });

  it("paginates scan when cursor is non-zero on first call", async () => {
    mockRedis.scan.mockResolvedValueOnce(["42", ["job:a"]]).mockResolvedValueOnce(["0", ["job:b"]]);
    mockPipeline.exec.mockResolvedValue([
      [null, makeJobHash({ job_id: "a" })],
      [null, makeJobHash({ job_id: "b" })],
    ]);

    const result = await makeService().getAllJobs();
    expect(mockRedis.scan).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });
});

// ─── getJobsUpdatedSince ──────────────────────────────────────────────────────

describe("getJobsUpdatedSince()", () => {
  it("returns empty array when no jobs fall in the range", async () => {
    mockRedis.zrangebyscore.mockResolvedValue([]);
    const result = await makeService().getJobsUpdatedSince(Date.now() - 5000);
    expect(result).toEqual([]);
  });

  it("returns jobs sorted by updated_at ascending", async () => {
    mockRedis.zrangebyscore.mockResolvedValue(["a", "b"]);
    mockPipeline.exec.mockResolvedValue([
      [null, makeJobHash({ job_id: "a", updated_at: "2000" })],
      [null, makeJobHash({ job_id: "b", updated_at: "1000" })],
    ]);

    const result = await makeService().getJobsUpdatedSince(0);
    expect(result[0].job_id).toBe("b");
    expect(result[1].job_id).toBe("a");
  });

  it("removes stale job IDs from the sorted set", async () => {
    mockRedis.zrangebyscore.mockResolvedValue(["stale-id"]);
    // Pipeline returns empty hash → parseJobHash returns null → stale
    mockPipeline.exec.mockResolvedValue([[null, {}]]);

    await makeService().getJobsUpdatedSince(0);
    expect(mockRedis.zrem).toHaveBeenCalledWith("jobs:updated", "stale-id");
  });
});

// ─── getJobSummary ────────────────────────────────────────────────────────────

describe("getJobSummary()", () => {
  it("counts jobs by status correctly", async () => {
    mockRedis.scan.mockResolvedValue(["0", ["job:a", "job:b", "job:c", "job:d"]]);
    mockPipeline.exec.mockResolvedValue([
      [null, makeJobHash({ job_id: "a", status: "queued" })],
      [null, makeJobHash({ job_id: "b", status: "processing" })],
      [null, makeJobHash({ job_id: "c", status: "completed" })],
      [null, makeJobHash({ job_id: "d", status: "failed" })],
    ]);

    const summary = await makeService().getJobSummary();
    expect(summary).toEqual({ total: 4, queued: 1, processing: 1, completed: 1, failed: 1 });
  });

  it("returns all-zero summary when there are no jobs", async () => {
    const summary = await makeService().getJobSummary();
    expect(summary).toEqual({ total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });
  });
});

// ─── clearAllJobs ─────────────────────────────────────────────────────────────

describe("clearAllJobs()", () => {
  it("deletes all job keys when they exist", async () => {
    mockRedis.scan.mockResolvedValue(["0", ["job:a", "job:b"]]);

    await makeService().clearAllJobs();

    expect(mockRedis.del).toHaveBeenCalledWith("job:a", "job:b", "job:a:logs", "job:b:logs");
  });

  it("deletes the queue and index keys", async () => {
    await makeService().clearAllJobs();
    expect(mockRedis.del).toHaveBeenCalledWith("download_queue", "jobs:updated");
  });

  it("does not call del for job keys when none exist", async () => {
    await makeService().clearAllJobs();
    // Only the queue + index del call should have happened
    const calls = mockRedis.del.mock.calls;
    expect(calls.every((c: string[]) => !c[0].startsWith("job:"))).toBe(true);
  });
});

// ─── deleteJob ────────────────────────────────────────────────────────────────

describe("deleteJob()", () => {
  it("returns true when the job key existed", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    const result = await makeService().deleteJob("test-job-id");
    expect(result).toBe(true);
  });

  it("returns false when the job key did not exist", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 0],
      [null, 0],
      [null, 0],
    ]);

    const result = await makeService().deleteJob("missing-id");
    expect(result).toBe(false);
  });

  it("removes the job from the updated index", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    await makeService().deleteJob("test-job-id");

    expect(mockPipeline.zrem).toHaveBeenCalledWith("jobs:updated", "test-job-id");
  });

  it("deletes the per-job log list too", async () => {
    mockPipeline.exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, 1],
    ]);

    await makeService().deleteJob("test-job-id");

    expect(mockPipeline.del).toHaveBeenCalledWith("job:test-job-id:logs");
  });
});

// ─── getJobLogs ──────────────────────────────────────────────────────────────

describe("getJobLogs()", () => {
  it("returns the persisted Redis log list when present", async () => {
    mockRedis.lrange.mockResolvedValue(["line one", "line two"]);

    const result = await makeService().getJobLogs("test-job-id");

    expect(result).toEqual(["line one", "line two"]);
    expect(mockRedis.hgetall).not.toHaveBeenCalled();
  });

  it("falls back to synthesized job details when no log list exists", async () => {
    mockRedis.lrange.mockResolvedValue([]);
    mockRedis.hgetall.mockResolvedValue(
      makeJobHash({
        status: "failed",
        progress: "0",
        error: "Download failed: auth failed",
      }),
    );

    const result = await makeService().getJobLogs("test-job-id");

    expect(result).toEqual([
      "No buffered worker logs were captured for job test-job-id.",
      "Status: failed (0%)",
      "Error: Download failed: auth failed",
    ]);
  });
});
