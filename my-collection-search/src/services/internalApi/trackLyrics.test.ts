import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import { clearTrackLyrics, fetchTrackLyrics, saveTrackLyrics } from "./trackLyrics";

const lyrics = { text: "verse", source: "user", updated_at: "2026-11-11T00:00:00.000Z" };
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchTrackLyrics", () => {
  it("reads the lyrics, uncached, encoding the id", async () => {
    httpMock.mockResolvedValue(lyrics);
    await expect(fetchTrackLyrics("a/b", 1)).resolves.toEqual({ kind: "lyrics", lyrics });
    expect(httpMock).toHaveBeenCalledWith("/api/tracks/a%2Fb/lyrics?friend_id=1", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("reads a 404 as no lyrics and a 403 as a friend's track", async () => {
    httpMock.mockRejectedValueOnce(httpError(404)).mockRejectedValueOnce(httpError(403));
    await expect(fetchTrackLyrics("t1", 1)).resolves.toEqual({ kind: "none" });
    await expect(fetchTrackLyrics("t1", 2)).resolves.toEqual({ kind: "not_owner" });
  });

  it("rethrows anything else", async () => {
    httpMock.mockRejectedValue(httpError(500));
    await expect(fetchTrackLyrics("t1", 1)).rejects.toThrow("HTTP 500");
  });
});

describe("saveTrackLyrics / clearTrackLyrics", () => {
  it("PUTs the text as JSON", async () => {
    httpMock.mockResolvedValue(lyrics);
    await expect(saveTrackLyrics("t1", 1, "verse")).resolves.toBe(lyrics);
    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1/lyrics?friend_id=1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "verse" }),
    });
  });

  it("DELETEs to clear", async () => {
    httpMock.mockResolvedValue({ deleted: true });
    await expect(clearTrackLyrics("t1", 1)).resolves.toEqual({ deleted: true });
    expect(httpMock).toHaveBeenCalledWith("/api/tracks/t1/lyrics?friend_id=1", {
      method: "DELETE",
    });
  });
});
