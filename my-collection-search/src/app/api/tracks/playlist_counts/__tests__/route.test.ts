import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetCounts } = vi.hoisted(() => ({ mockGetCounts: vi.fn() }));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { getPlaylistCountsForTracks: mockGetCounts },
}));

import { POST } from "../route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/tracks/playlist_counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockGetCounts.mockResolvedValue({ "t1:1": 2 });
});

describe("POST /api/tracks/playlist_counts", () => {
  it("returns the repository counts for valid refs", async () => {
    const res = await POST(req({ track_refs: [{ track_id: "t1", friend_id: 1 }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ "t1:1": 2 });
    expect(mockGetCounts).toHaveBeenCalledWith([{ track_id: "t1", friend_id: 1 }]);
  });

  it("drops malformed refs and looks up only the valid ones", async () => {
    const res = await POST(
      req({
        track_refs: [
          { track_id: "t1", friend_id: 1 },
          { track_id: "", friend_id: 1 },
          { track_id: "t2", friend_id: "1" },
          { track_id: "t3", friend_id: 1.5 },
          { track_id: 4, friend_id: 1 },
          { friend_id: 1 },
          null,
          "t5:1",
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGetCounts).toHaveBeenCalledWith([{ track_id: "t1", friend_id: 1 }]);
  });

  it("strips unknown keys from a valid ref", async () => {
    await POST(req({ track_refs: [{ track_id: "t1", friend_id: 1, extra: true }] }));
    expect(mockGetCounts).toHaveBeenCalledWith([{ track_id: "t1", friend_id: 1 }]);
  });

  it.each([
    ["no usable refs", { track_refs: [{ track_id: "t1" }, null] }],
    ["an empty array", { track_refs: [] }],
    ["a non-array", { track_refs: "t1:1" }],
    ["a missing track_refs", {}],
    ["a null body", null],
  ])("answers {} with 200, never a 400, for %s", async (_label, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(mockGetCounts).not.toHaveBeenCalled();
  });

  it("returns 500 when the repository throws", async () => {
    mockGetCounts.mockRejectedValue(new Error("db down"));
    const res = await POST(req({ track_refs: [{ track_id: "t1", friend_id: 1 }] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to get playlist counts");
  });

  it("returns 500 for a body that is not JSON, as before", async () => {
    const res = await POST(req("not json"));
    expect(res.status).toBe(500);
  });
});
