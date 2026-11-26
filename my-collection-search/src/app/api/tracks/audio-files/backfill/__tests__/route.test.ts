import { beforeEach, describe, expect, it, vi } from "vitest";

const backfill = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/trackAudioFileService", () => ({
  trackAudioFileService: { backfillSiblingAlternates: backfill },
}));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/tracks/audio-files/backfill", () => {
  it("returns the counts", async () => {
    backfill.mockResolvedValue({ scanned: 3, linked: 2, already_linked: 1, failed: 0 });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 3, linked: 2, already_linked: 1, failed: 0 });
  });

  it("answers 500 when the backfill throws", async () => {
    backfill.mockRejectedValue(new Error("db down"));
    const res = await POST();
    expect(res.status).toBe(500);
  });
});
