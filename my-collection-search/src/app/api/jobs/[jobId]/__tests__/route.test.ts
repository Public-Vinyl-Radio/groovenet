import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobDetailsSchema } from "@groovenet/contracts";

const redis = vi.hoisted(() => ({ getJobStatus: vi.fn() }));
vi.mock("@/server/services/redisJobService", () => ({ redisJobService: redis }));

import { GET } from "../route";

const get = (jobId: string) =>
  GET(new Request(`http://app/api/jobs/${jobId}`), { params: Promise.resolve({ jobId }) });

const status = (overrides: Record<string, unknown> = {}) => ({
  job_id: "j1",
  status: "completed",
  progress: 100,
  created_at: 1_000,
  started_at: 2_000,
  updated_at: 3_000,
  job_type: "download",
  track_id: "t1",
  friend_id: 1,
  result: { downloader: "gamdl", source_url_key: "apple_music_url" },
  ...overrides,
});

describe("GET /api/jobs/{jobId}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a missing id", async () => {
    expect((await get("")).status).toBe(400);
  });

  it("returns 404 for an unknown job", async () => {
    redis.getJobStatus.mockResolvedValue(null);
    expect((await get("nope")).status).toBe(404);
  });

  it("returns a completed job that matches the shared schema", async () => {
    redis.getJobStatus.mockResolvedValue(status());
    const body = await (await get("j1")).json();
    expect(jobDetailsSchema.parse(body)).toMatchObject({
      id: "j1",
      name: "download",
      state: "completed",
      queue: "download",
      finishedOn: 3_000,
      processedOn: 2_000,
      data: { track_id: "t1", downloader: "gamdl", source_url_key: "apple_music_url" },
    });
  });

  it("maps queue states and omits unset timestamps", async () => {
    redis.getJobStatus.mockResolvedValue(
      status({ status: "queued", job_type: undefined, name: undefined, result: undefined }),
    );
    const queued = await (await get("j1")).json();
    expect(queued).toMatchObject({ state: "waiting", name: "download-audio", progress: 100 });
    expect(queued.finishedOn).toBeUndefined();
    expect(queued.processedOn).toBeUndefined();

    redis.getJobStatus.mockResolvedValue(
      status({ status: "processing", started_at: undefined, progress: undefined }),
    );
    expect(await (await get("j1")).json()).toMatchObject({
      state: "active",
      progress: 0,
      processedOn: 1_000,
    });

    redis.getJobStatus.mockResolvedValue(status({ status: "failed", error: "bad" }));
    expect(await (await get("j1")).json()).toMatchObject({ state: "failed", failedReason: "bad" });
  });

  it("reports a lookup failure", async () => {
    redis.getJobStatus.mockRejectedValue(new Error("redis down"));
    const res = await get("j1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });
    redis.getJobStatus.mockRejectedValue("");
    expect(await (await get("j1")).json()).toEqual({ error: "Failed to fetch job details" });
  });
});
