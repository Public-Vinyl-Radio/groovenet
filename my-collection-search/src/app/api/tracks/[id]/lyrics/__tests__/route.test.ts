import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findTrackLibrary: vi.fn(),
  find: vi.fn(),
  saveUserLyrics: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/server/repositories/trackLyricsRepository", () => ({ trackLyricsRepository: repo }));

import { DELETE, GET, PUT } from "../route";

const updatedAt = new Date("2026-11-11T10:00:00.000Z");
const params = { params: Promise.resolve({ id: "t1" }) };
const url = (query = "?friend_id=1") => `http://localhost/api/tracks/t1/lyrics${query}`;

const get = (query?: string) => GET(new NextRequest(url(query)), params);
const put = (body: unknown, query?: string) =>
  PUT(
    new NextRequest(url(query), {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    params,
  );
const del = (query?: string) => DELETE(new NextRequest(url(query), { method: "DELETE" }), params);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DISCOGS_USERNAME", "owner");
  repo.findTrackLibrary.mockResolvedValue("owner");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/tracks/[id]/lyrics", () => {
  it("returns the owner's lyrics with their source", async () => {
    repo.find.mockResolvedValue({ text: "verse", source: "embedded", updated_at: updatedAt });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: "verse",
      source: "embedded",
      updated_at: "2026-11-11T10:00:00.000Z",
    });
    expect(repo.findTrackLibrary).toHaveBeenCalledWith("t1", 1);
    expect(repo.find).toHaveBeenCalledWith("t1", 1);
  });

  it("is a 404 when the owner's track has none", async () => {
    repo.find.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No lyrics for this track" });
  });

  it("never returns a friend's lyrics, and never reads them", async () => {
    repo.findTrackLibrary.mockResolvedValue("a-friend");
    repo.find.mockResolvedValue({ text: "verse", source: "embedded", updated_at: updatedAt });
    const res = await get("?friend_id=2");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Lyrics are kept for your own library only" });
    expect(repo.find).not.toHaveBeenCalled();
  });

  it("treats every library as a friend's when DISCOGS_USERNAME is unset", async () => {
    vi.stubEnv("DISCOGS_USERNAME", "");
    expect((await get()).status).toBe(403);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it("is a 404 for an unknown track", async () => {
    repo.findTrackLibrary.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Track not found" });
  });

  it("validates friend_id", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?friend_id=x")).status).toBe(400);
    expect((await get("?friend_id=1.5")).status).toBe(400);
    expect(repo.findTrackLibrary).not.toHaveBeenCalled();
  });

  it("is a 500 when the database fails", async () => {
    repo.find.mockRejectedValue(new Error("db down"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to read lyrics" });
  });
});

describe("PUT /api/tracks/[id]/lyrics", () => {
  it("stores the text as the user's, stripping null bytes", async () => {
    repo.saveUserLyrics.mockResolvedValue({
      text: "my verse",
      source: "user",
      updated_at: "2026-11-11T10:00:00.000Z",
    });
    const res = await put({ text: "my\u0000 verse" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: "my verse",
      source: "user",
      updated_at: "2026-11-11T10:00:00.000Z",
    });
    expect(repo.saveUserLyrics).toHaveBeenCalledWith("t1", 1, "my verse");
  });

  it("refuses blank text and points at DELETE", async () => {
    const res = await put({ text: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/DELETE clears lyrics/);
    expect(repo.saveUserLyrics).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    const res = await put("not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("never writes lyrics onto a friend's track", async () => {
    repo.findTrackLibrary.mockResolvedValue("a-friend");
    expect((await put({ text: "verse" }, "?friend_id=2")).status).toBe(403);
    expect(repo.saveUserLyrics).not.toHaveBeenCalled();
  });

  it("validates friend_id before reading the body", async () => {
    expect((await put({ text: "verse" }, "")).status).toBe(400);
    expect(repo.findTrackLibrary).not.toHaveBeenCalled();
  });

  it("is a 500 when the write fails", async () => {
    repo.saveUserLyrics.mockRejectedValue(new Error("db down"));
    const res = await put({ text: "verse" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to save lyrics" });
  });
});

describe("DELETE /api/tracks/[id]/lyrics", () => {
  it("deletes the row and says whether there was one", async () => {
    repo.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await (await del()).json()).toEqual({ deleted: true });
    expect(await (await del()).json()).toEqual({ deleted: false });
    expect(repo.delete).toHaveBeenCalledWith("t1", 1);
  });

  it("never clears a friend's track", async () => {
    repo.findTrackLibrary.mockResolvedValue("a-friend");
    expect((await del("?friend_id=2")).status).toBe(403);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("validates friend_id", async () => {
    expect((await del("?friend_id=")).status).toBe(400);
  });

  it("is a 500 when the delete fails", async () => {
    repo.delete.mockRejectedValue(new Error("db down"));
    const res = await del();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to clear lyrics" });
  });
});
