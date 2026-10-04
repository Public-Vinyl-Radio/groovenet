import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getPreview = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/embeddingsService", () => ({ embeddingsService: { getPreview } }));

import { GET } from "../route";

function get(query: string, id = "t1") {
  return GET(new NextRequest(`http://app/api/tracks/${id}/embedding-preview?${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getPreview.mockResolvedValue({ type: "identity", text: "t", data: {} });
});

describe("GET /api/tracks/{id}/embedding-preview", () => {
  it.each([
    ["friend_id=1", "identity"],
    ["friend_id=1&type=identity", "identity"],
    ["friend_id=1&type=audio_vibe", "audio_vibe"],
    ["friend_id=1&type=context", "context"],
    ["friend_id=1&type=nonsense", "identity"],
  ])("?%s previews %s", async (query, type) => {
    const res = await get(query);

    expect(res.status).toBe(200);
    expect(getPreview).toHaveBeenCalledWith(type, "t1", 1);
  });

  it.each(["", "friend_id=abc", "friend_id=0"])("rejects ?%s with 400", async (query) => {
    const res = await get(query);

    expect(res.status).toBe(400);
    expect(getPreview).not.toHaveBeenCalled();
  });

  it("returns 422 when the track has no audio analysis", async () => {
    getPreview.mockRejectedValue(new Error("Track missing audio analysis data"));

    const res = await get("friend_id=1&type=audio_vibe");

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("missing_audio_analysis");
  });

  it("returns 500 for anything else", async () => {
    getPreview.mockRejectedValue(new Error("Track not found: t1 (friend_id: 1)"));

    const res = await get("friend_id=1&type=context");

    expect(res.status).toBe(500);
  });

  it("reports a non-Error rejection as unknown", async () => {
    getPreview.mockRejectedValue("boom");

    const res = await get("friend_id=1");

    expect(await res.json()).toEqual({ error: "Unknown error" });
  });
});
