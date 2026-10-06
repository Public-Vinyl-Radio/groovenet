import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTrackMetadata = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/trackMetadataAiService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/trackMetadataAiService")>()),
  generateTrackMetadata,
}));

import { POST } from "../route";
import { TrackMetadataError } from "@/server/services/trackMetadataAiService";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/providers/openai/track-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("POST /api/providers/openai/track-metadata", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes the track through so the album's genres reach the prompt", async () => {
    const suggestion = { genres: [], descriptors: ["dub"], notes: "n" };
    generateTrackMetadata.mockResolvedValueOnce(suggestion);

    const res = await post({ prompt: "p", friend_id: 6, track_id: "t1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(suggestion);
    expect(generateTrackMetadata).toHaveBeenCalledWith({ prompt: "p", friendId: 6, trackId: "t1" });
  });

  it("ignores a friend or track of the wrong type", async () => {
    generateTrackMetadata.mockResolvedValueOnce({ genres: [], descriptors: [], notes: "" });
    await post({ prompt: "p", friend_id: "6", track_id: "" });
    expect(generateTrackMetadata).toHaveBeenCalledWith({
      prompt: "p",
      friendId: undefined,
      trackId: undefined,
    });
  });

  it("returns a TrackMetadataError with its status", async () => {
    generateTrackMetadata.mockRejectedValueOnce(new TrackMetadataError("Missing or invalid prompt", 400));
    const res = await post({ prompt: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing or invalid prompt" });
  });

  it("returns 500 for anything else", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generateTrackMetadata.mockRejectedValueOnce(new Error("boom"));
    const res = await post({ prompt: "p" });
    expect(res.status).toBe(500);
  });
});
