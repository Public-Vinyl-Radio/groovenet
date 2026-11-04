import { beforeEach, describe, expect, it, vi } from "vitest";

const createDurationJob = vi.fn();
vi.mock("@/server/services/redisJobService", () => ({
  redisJobService: { createDurationJob: (...a: unknown[]) => createDurationJob(...a) },
}));

import { POST } from "../route";

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/tracks/fix-duration", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/tracks/fix-duration", () => {
  beforeEach(() => {
    createDurationJob.mockReset();
    createDurationJob.mockResolvedValue("job-9");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("queues a job, defaulting local_audio_url to null", async () => {
    const res = await call({ track_id: "t1", friend_id: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, jobId: "job-9" });
    expect(createDurationJob).toHaveBeenCalledWith({
      track_id: "t1",
      friend_id: 2,
      local_audio_url: null,
    });
  });

  it("passes local_audio_url through and coerces a numeric-string friend_id", async () => {
    await call({ track_id: "t1", friend_id: "3", local_audio_url: "a.m4a" });
    expect(createDurationJob).toHaveBeenCalledWith({
      track_id: "t1",
      friend_id: 3,
      local_audio_url: "a.m4a",
    });
  });

  it("requires track_id and friend_id", async () => {
    for (const body of [
      {},
      { track_id: "t1" },
      { friend_id: 2 },
      { track_id: "t1", friend_id: null },
    ]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "track_id and friend_id are required" });
    }
    expect(createDurationJob).not.toHaveBeenCalled();
  });

  it("returns 500 with the message when queueing fails", async () => {
    createDurationJob.mockRejectedValue(new Error("redis down"));
    const res = await call({ track_id: "t1", friend_id: 2 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });
    createDurationJob.mockRejectedValue("boom");
    expect(await (await call({ track_id: "t1", friend_id: 2 })).json()).toEqual({ error: "boom" });
  });
});
