import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({ createDownloadJob: vi.fn() }));
vi.mock("@/server/services/redisJobService", () => ({ redisJobService: jobs }));
vi.mock("@/lib/analytics/server", () => ({ analytics: { track: vi.fn() } }));

const repo = vi.hoisted(() => ({ getTracksForAlbumDownloadQueue: vi.fn() }));
vi.mock("@/server/repositories/albumRepository", () => ({ albumRepository: repo }));

import { queueAlbumDownloadsResponseSchema } from "@/api-contract/schemas";
import { POST } from "../route";

const params = { params: Promise.resolve({ releaseId: "r1" }) };
const post = (query = "?friend_id=7") =>
  POST(new Request(`http://localhost/api/albums/r1/download${query}`, { method: "POST" }), params);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/albums/[releaseId]/download", () => {
  it("queues one job per missing track", async () => {
    repo.getTracksForAlbumDownloadQueue.mockResolvedValue([
      { track_id: "t1", friend_id: 7, apple_music_url: "https://music.apple.com/1", title: "A" },
      { track_id: "t2", friend_id: 7, youtube_url: "https://youtu.be/2" },
    ]);
    jobs.createDownloadJob.mockResolvedValueOnce("j1").mockResolvedValueOnce("j2");

    const res = await post();

    expect(res.status).toBe(200);
    expect(queueAlbumDownloadsResponseSchema.parse(await res.json())).toEqual({
      success: true,
      message: "Queued 2 tracks for download",
      jobIds: ["j1", "j2"],
      tracksQueued: 2,
    });
    expect(jobs.createDownloadJob).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: "t2", youtube_url: "https://youtu.be/2" }),
    );
  });

  it("uses the singular for one track", async () => {
    repo.getTracksForAlbumDownloadQueue.mockResolvedValue([{ track_id: "t1", friend_id: 7 }]);
    jobs.createDownloadJob.mockResolvedValue("j1");
    const body = await (await post()).json();
    expect(body.message).toBe("Queued 1 track for download");
  });

  it("reports nothing to do when no track needs downloading", async () => {
    repo.getTracksForAlbumDownloadQueue.mockResolvedValue([]);
    const res = await post();
    expect(await res.json()).toEqual({
      success: true,
      message: "No tracks need downloading",
      jobIds: [],
      tracksQueued: 0,
    });
    expect(jobs.createDownloadJob).not.toHaveBeenCalled();
  });

  it("requires friend_id", async () => {
    const res = await post("");
    expect(res.status).toBe(400);
  });

  it("500s when queueing fails", async () => {
    repo.getTracksForAlbumDownloadQueue.mockRejectedValue(new Error("redis down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Failed to enqueue downloads" });
  });
});
