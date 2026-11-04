import { beforeEach, describe, expect, it, vi } from "vitest";

const createDownloadJob = vi.fn();
vi.mock("@/server/services/redisJobService", () => ({
  redisJobService: { createDownloadJob: (...a: unknown[]) => createDownloadJob(...a) },
}));

import { POST } from "../route";

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/tracks/analyze-async", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/tracks/analyze-async", () => {
  beforeEach(() => {
    createDownloadJob.mockReset();
    createDownloadJob.mockResolvedValue("job-1");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("queues a job and returns its id", async () => {
    const res = await call({
      track_id: "t1",
      friend_id: 2,
      youtube_url: "https://y.example/x",
      apple_music_url: null,
      preferred_downloader: "yt-dlp",
      title: "A",
      artist: "B",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      jobId: "job-1",
      message: "Audio processing job queued successfully",
    });
    expect(createDownloadJob).toHaveBeenCalledWith({
      track_id: "t1",
      friend_id: 2,
      youtube_url: "https://y.example/x",
      apple_music_url: undefined,
      soundcloud_url: undefined,
      preferred_downloader: "yt-dlp",
      title: "A",
      artist: "B",
    });
  });

  it("accepts every preferred downloader and a numeric-string friend_id", async () => {
    for (const preferred_downloader of ["freyr", "spotdl", "yt-dlp", "scdl"]) {
      const res = await call({
        track_id: "t1",
        friend_id: "2",
        soundcloud_url: "https://s.example/x",
        preferred_downloader,
      });
      expect(res.status, preferred_downloader).toBe(200);
    }
    expect(createDownloadJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ friend_id: 2, preferred_downloader: "scdl" }),
    );
  });

  it("requires track_id and friend_id", async () => {
    for (const body of [
      {},
      { track_id: "t1" },
      { friend_id: 2 },
      { track_id: "t1", friend_id: "x" },
    ]) {
      const res = await call({ ...body, youtube_url: "https://y.example/x" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "track_id and friend_id are required" });
    }
    expect(createDownloadJob).not.toHaveBeenCalled();
  });

  it("requires at least one music service URL", async () => {
    const res = await call({
      track_id: "t1",
      friend_id: 2,
      youtube_url: null,
      apple_music_url: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "At least one music service URL is required" });
  });

  it("rejects an unknown downloader", async () => {
    const res = await call({
      track_id: "t1",
      friend_id: 2,
      youtube_url: "https://y.example/x",
      preferred_downloader: "curl",
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 with the message when queueing fails", async () => {
    createDownloadJob.mockRejectedValue(new Error("redis down"));
    const res = await call({ track_id: "t1", friend_id: 2, youtube_url: "https://y.example/x" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });
  });

  it("returns 500 for a non-Error throw and for an unparseable body", async () => {
    createDownloadJob.mockRejectedValue("boom");
    const res = await call({ track_id: "t1", friend_id: 2, youtube_url: "https://y.example/x" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
    const bad = await POST(
      new Request("http://localhost/api/tracks/analyze-async", { method: "POST", body: "{" }),
    );
    expect(bad.status).toBe(500);
  });
});
