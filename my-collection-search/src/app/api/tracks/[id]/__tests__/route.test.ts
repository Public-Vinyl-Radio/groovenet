import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockSoftDelete, mockFindWithFallback } = vi.hoisted(() => ({
  mockSoftDelete: vi.fn(),
  mockFindWithFallback: vi.fn(),
}));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    softDeleteTrack: mockSoftDelete,
    findTrackByTrackIdAndFriendIdWithLibraryFallback: mockFindWithFallback,
  },
}));

import { DELETE, GET } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(query = "") {
  return new NextRequest(`http://localhost/api/tracks/t1${query}`);
}

function makeParams(id = "t1") {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockSoftDelete.mockReset();
  mockFindWithFallback.mockReset();
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe("DELETE /api/tracks/[id]", () => {
  it("returns 400 when friend_id is missing", async () => {
    const res = await DELETE(makeReq(), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required parameters/i);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("returns 400 when track_id (path param) is empty", async () => {
    const res = await DELETE(makeReq("?friend_id=1"), makeParams(""));
    expect(res.status).toBe(400);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("returns 400 when friend_id is not a number", async () => {
    const res = await DELETE(makeReq("?friend_id=abc"), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be a number/i);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("returns 404 when the track is not found or already deleted", async () => {
    mockSoftDelete.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(404);
    expect(mockSoftDelete).toHaveBeenCalledWith("t1", 1);
  });

  it("returns 200 with the delete payload on success", async () => {
    mockSoftDelete.mockResolvedValueOnce({ track_id: "t1" });
    const res = await DELETE(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, track_id: "t1", friend_id: 1 });
  });

  it("trims whitespace around friend_id", async () => {
    mockSoftDelete.mockResolvedValueOnce({ track_id: "t1" });
    const res = await DELETE(makeReq("?friend_id=%20%202%20%20"), makeParams());
    expect(res.status).toBe(200);
    expect(mockSoftDelete).toHaveBeenCalledWith("t1", 2);
  });

  it("returns 500 when the repository throws", async () => {
    mockSoftDelete.mockRejectedValueOnce(new Error("DB down"));
    const res = await DELETE(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed/i);
  });
});

// ─── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/tracks/[id]", () => {
  it("returns 400 when friend_id is missing", async () => {
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(400);
    expect(mockFindWithFallback).not.toHaveBeenCalled();
  });

  it("returns 400 when friend_id is not a number", async () => {
    const res = await GET(makeReq("?friend_id=nope"), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/must be a number/i);
  });

  it("returns 404 when the track is not found", async () => {
    mockFindWithFallback.mockResolvedValueOnce(null);
    const res = await GET(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(404);
    expect(mockFindWithFallback).toHaveBeenCalledWith("t1", 1);
  });

  it("returns 200 with the track on success", async () => {
    const track = { track_id: "t1", friend_id: 1, title: "Song" };
    mockFindWithFallback.mockResolvedValueOnce(track);
    const res = await GET(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(track);
  });

  it("returns 500 when the repository throws", async () => {
    mockFindWithFallback.mockRejectedValueOnce(new Error("DB down"));
    const res = await GET(makeReq("?friend_id=1"), makeParams());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed/i);
  });
});
