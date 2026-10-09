import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getState: vi.fn(),
  apply: vi.fn(),
  previewAppleMusicArt: vi.fn(),
  upload: vi.fn(),
  match: vi.fn(),
  listReview: vi.fn(),
}));
vi.mock("@/server/services/albumArtworkService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/albumArtworkService")>();
  return { ...actual, albumArtworkService: service };
});

const trackOps = vi.hoisted(() => ({ queueCoverArtBackfillJobs: vi.fn() }));
vi.mock("@/server/services/trackOpsService", () => ({ trackOpsService: trackOps }));

import { AlbumArtworkError } from "@/server/services/albumArtworkService";
import { GET as getArtwork, PUT as putArtwork } from "../[releaseId]/artwork/route";
import { POST as postPreview } from "../[releaseId]/artwork/preview/route";
import { POST as postUpload } from "../[releaseId]/artwork/upload/route";
import { POST as postMatch } from "../[releaseId]/artwork/match/route";
import { POST as postBackfill } from "../artwork/backfill/route";
import { GET as getReview } from "../artwork/review/route";

const params = { params: Promise.resolve({ releaseId: "r1" }) };

const state = {
  release_id: "r1",
  friend_id: 7,
  current_url: "/uploads/album-covers/a.jpg",
  source: "apple_music",
  discogs_art_url: "https://i.discogs.com/r1.jpg",
  apple_music_art_url: "/uploads/album-covers/a.jpg",
  art_match_status: null,
  art_match_distance: null,
  has_local_audio: true,
};

function req(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${url}`, init);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/albums/[releaseId]/artwork", () => {
  it("returns the artwork state", async () => {
    service.getState.mockResolvedValue(state);
    const res = await getArtwork(req("/api/albums/r1/artwork?friend_id=7"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(state);
    expect(service.getState).toHaveBeenCalledWith("r1", 7);
  });

  it("requires friend_id", async () => {
    const res = await getArtwork(req("/api/albums/r1/artwork"), params);
    expect(res.status).toBe(400);
  });

  it("passes an artwork error's status through", async () => {
    service.getState.mockRejectedValue(new AlbumArtworkError("Album not found", 404));
    const res = await getArtwork(req("/api/albums/r1/artwork?friend_id=7"), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Album not found" });
  });

  it("is a 500 for anything else", async () => {
    service.getState.mockRejectedValueOnce(new Error("db down"));
    let res = await getArtwork(req("/api/albums/r1/artwork?friend_id=7"), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });

    service.getState.mockRejectedValueOnce("weird");
    res = await getArtwork(req("/api/albums/r1/artwork?friend_id=7"), params);
    expect(await res.json()).toEqual({ error: "Failed to load album artwork" });
  });
});

describe("PUT /api/albums/[releaseId]/artwork", () => {
  const put = (body: unknown, query = "?friend_id=7") =>
    putArtwork(
      req(`/api/albums/r1/artwork${query}`, {
        method: "PUT",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      params
    );

  it("applies the chosen source", async () => {
    service.apply.mockResolvedValue({ ...state, source: "discogs" });
    const res = await put({ source: "discogs" });
    expect(res.status).toBe(200);
    expect(service.apply).toHaveBeenCalledWith("r1", 7, "discogs");
  });

  it("rejects an unknown source, a bad body or a missing friend_id", async () => {
    expect((await put({ source: "upload" })).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
    expect((await put({ source: "discogs" }, "")).status).toBe(400);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("maps service errors", async () => {
    service.apply.mockRejectedValue(new AlbumArtworkError("Could not download artwork: HTTP 404", 502));
    expect((await put({ source: "discogs" })).status).toBe(502);
  });
});

describe("POST /api/albums/[releaseId]/artwork/preview", () => {
  it("returns the preview", async () => {
    const preview = { url: "/uploads/album-covers/a.jpg", width: 1400, height: 1400, track_id: "t1" };
    service.previewAppleMusicArt.mockResolvedValue(preview);
    const res = await postPreview(req("/api/albums/r1/artwork/preview?friend_id=7", { method: "POST" }), params);
    expect(await res.json()).toEqual(preview);
  });

  it("requires friend_id and maps errors", async () => {
    expect((await postPreview(req("/api/albums/r1/artwork/preview", { method: "POST" }), params)).status).toBe(400);
    service.previewAppleMusicArt.mockRejectedValue(new AlbumArtworkError("No downloaded track", 404));
    expect(
      (await postPreview(req("/api/albums/r1/artwork/preview?friend_id=7", { method: "POST" }), params)).status
    ).toBe(404);
  });
});

describe("POST /api/albums/[releaseId]/artwork/upload", () => {
  const upload = (form: FormData | null, query = "?friend_id=7") =>
    postUpload(
      req(`/api/albums/r1/artwork/upload${query}`, { method: "POST", body: form ?? "plain" }),
      params
    );

  it("uploads the cover_art file", async () => {
    service.upload.mockResolvedValue({ ...state, source: "upload" });
    const form = new FormData();
    form.set("cover_art", new File(["img"], "c.png", { type: "image/png" }));

    const res = await upload(form);

    expect(res.status).toBe(200);
    expect(service.upload).toHaveBeenCalledWith("r1", 7, expect.any(File));
  });

  it("requires a non-empty file and a friend_id", async () => {
    expect((await upload(new FormData())).status).toBe(400);
    const empty = new FormData();
    empty.set("cover_art", new File([], "c.png"));
    expect((await upload(empty)).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
    expect((await upload(new FormData(), "")).status).toBe(400);
  });

  it("maps service errors", async () => {
    service.upload.mockRejectedValue(new AlbumArtworkError("Invalid file type", 400));
    const form = new FormData();
    form.set("cover_art", new File(["img"], "c.gif", { type: "image/gif" }));
    const res = await upload(form);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid file type" });
  });
});

describe("POST /api/albums/[releaseId]/artwork/match", () => {
  it("returns the match verdict", async () => {
    const result = {
      release_id: "r1",
      friend_id: 7,
      status: "mismatch",
      distance: 24,
      applied: false,
      apple_music_art_url: "/uploads/album-covers/a.jpg",
    };
    service.match.mockResolvedValue(result);
    const res = await postMatch(req("/api/albums/r1/artwork/match?friend_id=7", { method: "POST" }), params);
    expect(await res.json()).toEqual(result);
  });

  it("requires friend_id and maps errors", async () => {
    expect((await postMatch(req("/api/albums/r1/artwork/match", { method: "POST" }), params)).status).toBe(400);
    service.match.mockRejectedValue(new Error("boom"));
    expect(
      (await postMatch(req("/api/albums/r1/artwork/match?friend_id=7", { method: "POST" }), params)).status
    ).toBe(500);
  });
});

describe("POST /api/albums/artwork/backfill", () => {
  const result = { queued: 2, queuedAlbums: 2, tracksImpacted: 9, jobIds: ["a", "b"], errors: [] };
  const post = (body?: string) =>
    postBackfill(req("/api/albums/artwork/backfill", { method: "POST", body }));

  it("queues for one friend, or everyone", async () => {
    trackOps.queueCoverArtBackfillJobs.mockResolvedValue(result);

    expect(await (await post(JSON.stringify({ friend_id: 7 }))).json()).toEqual(result);
    expect(trackOps.queueCoverArtBackfillJobs).toHaveBeenLastCalledWith({ friend_id: 7 });

    await post();
    expect(trackOps.queueCoverArtBackfillJobs).toHaveBeenLastCalledWith({ friend_id: null });
  });

  it("rejects a bad friend_id", async () => {
    expect((await post(JSON.stringify({ friend_id: -1 }))).status).toBe(400);
  });

  it("is a 500 when queueing fails", async () => {
    trackOps.queueCoverArtBackfillJobs.mockRejectedValueOnce(new Error("redis down"));
    let res = await post("{}");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });

    trackOps.queueCoverArtBackfillJobs.mockRejectedValueOnce("x");
    res = await post("{}");
    expect(await res.json()).toEqual({ error: "Failed to queue artwork matching" });
  });
});

describe("GET /api/albums/artwork/review", () => {
  it("lists flagged albums, defaulting the limit", async () => {
    service.listReview.mockResolvedValue([]);
    const res = await getReview(req("/api/albums/artwork/review?friend_id=7"));
    expect(await res.json()).toEqual({ albums: [] });
    expect(service.listReview).toHaveBeenCalledWith(7, 50);

    await getReview(req("/api/albums/artwork/review?limit=5"));
    expect(service.listReview).toHaveBeenLastCalledWith(null, 5);
  });

  it("rejects a bad limit", async () => {
    expect((await getReview(req("/api/albums/artwork/review?limit=0"))).status).toBe(400);
  });

  it("is a 500 when listing fails", async () => {
    service.listReview.mockRejectedValueOnce(new Error("db down"));
    let res = await getReview(req("/api/albums/artwork/review"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });

    service.listReview.mockRejectedValueOnce("x");
    res = await getReview(req("/api/albums/artwork/review"));
    expect(await res.json()).toEqual({ error: "Failed to list artwork review" });
  });
});
