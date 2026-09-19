import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClearAllJobs, mockGetAllJobs, mockFindTracks } = vi.hoisted(() => ({
  mockClearAllJobs: vi.fn(),
  mockGetAllJobs: vi.fn(),
  mockFindTracks: vi.fn(),
}));

vi.mock("@/server/services/redisJobService", () => ({
  redisJobService: { clearAllJobs: mockClearAllJobs, getAllJobs: mockGetAllJobs },
}));
vi.mock("@/server/repositories/jobRepository", () => ({
  jobRepository: { findTracksByTrackAndFriendPairs: mockFindTracks },
}));

import { jobsApiService } from "../jobsApiService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function job(overrides: Record<string, unknown> = {}) {
  return {
    job_id: "j1",
    status: "queued",
    track_id: "t1",
    friend_id: 1,
    progress: 0,
    name: "download-audio",
    job_type: "download",
    created_at: 1000,
    updated_at: 2000,
    started_at: 1500,
    result: undefined,
    error: undefined,
    ...overrides,
  };
}

const params = (over: Partial<{ limit: number; offset: number; state: string }> = {}) =>
  ({ limit: 50, offset: 0, state: "all", ...over }) as Parameters<
    typeof jobsApiService.listJobs
  >[0];

beforeEach(() => {
  vi.resetAllMocks();
  mockGetAllJobs.mockResolvedValue([]);
  mockFindTracks.mockResolvedValue([]);
});

// ─── clearAllJobs ─────────────────────────────────────────────────────────────

describe("JobsApiService.clearAllJobs", () => {
  it("delegates to the redis job service", async () => {
    await jobsApiService.clearAllJobs();
    expect(mockClearAllJobs).toHaveBeenCalledOnce();
  });
});

// ─── summary + filtering ────────────────────────────────────────────────────

describe("JobsApiService.listJobs — summary and filtering", () => {
  it("counts jobs by status in the summary regardless of filter", async () => {
    mockGetAllJobs.mockResolvedValueOnce([
      job({ job_id: "a", status: "queued" }),
      job({ job_id: "b", status: "processing" }),
      job({ job_id: "c", status: "completed" }),
      job({ job_id: "d", status: "failed" }),
      job({ job_id: "e", status: "queued" }),
    ]);
    const res = await jobsApiService.listJobs(params({ state: "completed" }));
    expect(res.summary).toEqual({
      total: 5,
      waiting: 2,
      active: 1,
      completed: 1,
      failed: 1,
    });
    // Filter still applies to the returned jobs.
    expect(res.jobs.map((j) => j.id)).toEqual(["c"]);
  });

  it("maps redis statuses to job states (queued→waiting, processing→active)", async () => {
    mockGetAllJobs.mockResolvedValueOnce([
      job({ job_id: "a", status: "queued" }),
      job({ job_id: "b", status: "processing" }),
      job({ job_id: "c", status: "failed" }),
    ]);
    const res = await jobsApiService.listJobs(params());
    expect(res.jobs.map((j) => j.state)).toEqual(["waiting", "active", "failed"]);
  });
});

// ─── pagination ───────────────────────────────────────────────────────────────

describe("JobsApiService.listJobs — pagination", () => {
  it("slices by offset/limit and reports has_more/total_filtered", async () => {
    mockGetAllJobs.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => job({ job_id: `j${i}`, track_id: `t${i}` }))
    );
    const res = await jobsApiService.listJobs(params({ limit: 2, offset: 0 }));
    expect(res.jobs.map((j) => j.id)).toEqual(["j0", "j1"]);
    expect(res.pagination).toEqual({
      limit: 2,
      offset: 0,
      total_filtered: 5,
      has_more: true,
    });
  });

  it("reports has_more=false on the last page", async () => {
    mockGetAllJobs.mockResolvedValueOnce(
      Array.from({ length: 3 }, (_, i) => job({ job_id: `j${i}`, track_id: `t${i}` }))
    );
    const res = await jobsApiService.listJobs(params({ limit: 2, offset: 2 }));
    expect(res.jobs.map((j) => j.id)).toEqual(["j2"]);
    expect(res.pagination.has_more).toBe(false);
  });
});

// ─── track pair resolution ──────────────────────────────────────────────────

describe("JobsApiService.listJobs — track pairs", () => {
  it("queries only unique, valid (track_id + finite friend_id) pairs", async () => {
    mockGetAllJobs.mockResolvedValueOnce([
      job({ job_id: "a", track_id: "t1", friend_id: 1 }),
      job({ job_id: "b", track_id: "t1", friend_id: 1 }), // duplicate pair
      job({ job_id: "c", track_id: "t2", friend_id: 2 }),
      job({ job_id: "d", track_id: null, friend_id: 3 }), // no track_id
      job({ job_id: "e", track_id: "t9", friend_id: NaN }), // non-finite friend_id
    ]);
    await jobsApiService.listJobs(params());
    const pairs = mockFindTracks.mock.calls[0][0];
    expect(pairs).toEqual([
      { trackId: "t1", friendId: 1 },
      { trackId: "t2", friendId: 2 },
    ]);
  });

  it("defaults a non-finite friend_id to 0 in the output data", async () => {
    mockGetAllJobs.mockResolvedValueOnce([job({ track_id: "t9", friend_id: NaN })]);
    const res = await jobsApiService.listJobs(params());
    expect(res.jobs[0].data.friend_id).toBe(0);
  });
});

// ─── enrichment + field fallbacks ─────────────────────────────────────────────

describe("JobsApiService.listJobs — enrichment", () => {
  it("enriches from the matched track row", async () => {
    mockGetAllJobs.mockResolvedValueOnce([job({ track_id: "t1", friend_id: 1 })]);
    mockFindTracks.mockResolvedValueOnce([
      {
        track_id: "t1",
        friend_id: 1,
        title: "Track Title",
        artist: "Track Artist",
        album: "Album",
        release_id: "rel-1",
      },
    ]);
    const res = await jobsApiService.listJobs(params());
    expect(res.jobs[0].data).toMatchObject({
      title: "Track Title",
      artist: "Track Artist",
      album: "Album",
      release_id: "rel-1",
    });
  });

  it("prefers job.result.title/artist over the track row", async () => {
    mockGetAllJobs.mockResolvedValueOnce([
      job({ track_id: "t1", friend_id: 1, result: { title: "Result Title", artist: "Result Artist" } }),
    ]);
    mockFindTracks.mockResolvedValueOnce([
      { track_id: "t1", friend_id: 1, title: "Track Title", artist: "Track Artist" },
    ]);
    const res = await jobsApiService.listJobs(params());
    expect(res.jobs[0].data.title).toBe("Result Title");
    expect(res.jobs[0].data.artist).toBe("Result Artist");
  });

  it("falls back to track_id for the title when nothing else is available", async () => {
    mockGetAllJobs.mockResolvedValueOnce([job({ track_id: "t42", friend_id: 1 })]);
    const res = await jobsApiService.listJobs(params());
    expect(res.jobs[0].data.title).toBe("t42");
  });

  it("sets finishedOn/processedOn based on status", async () => {
    mockGetAllJobs.mockResolvedValueOnce([
      job({ job_id: "q", status: "queued" }),
      job({ job_id: "d", status: "completed", updated_at: 9999, started_at: 800 }),
    ]);
    const res = await jobsApiService.listJobs(params());
    const [q, d] = res.jobs;
    expect(q.finishedOn).toBeUndefined();
    expect(q.processedOn).toBeUndefined();
    expect(d.finishedOn).toBe(9999);
    expect(d.processedOn).toBe(800);
  });
});
