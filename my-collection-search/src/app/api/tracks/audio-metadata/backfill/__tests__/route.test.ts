import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/server/services/audioMetadataBackfillService", () => ({
  audioMetadataBackfillService: service,
}));

import { POST } from "../route";

const run = {
  run_id: "r1",
  total: 2,
  probed: 0,
  skipped: 0,
  missing_files: 0,
  probe_failures: 0,
  sources: { apple_music: 0, youtube: 0, soundcloud: 0, upload: 0, unknown: 0 },
  weak_youtube_hints: 0,
  errors: [],
  started_at: 1,
  updated_at: 1,
  complete: false,
};

const post = (body?: string) =>
  new Request("http://app/api/tracks/audio-metadata/backfill", { method: "POST", body });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.start.mockResolvedValue(run);
});

describe("POST /api/tracks/audio-metadata/backfill", () => {
  it("starts a run with no body", async () => {
    const res = await POST(post());
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ run_id: "r1", total: 2 });
    expect(service.start).toHaveBeenCalledWith({});
  });

  it("passes force and friend_id", async () => {
    await POST(post(JSON.stringify({ force: true, friend_id: 3 })));
    expect(service.start).toHaveBeenCalledWith({ force: true, friend_id: 3 });
  });

  it("rejects an invalid body and malformed JSON", async () => {
    expect((await POST(post(JSON.stringify({ friend_id: "x" })))).status).toBe(400);
    expect((await POST(post("{nope"))).status).toBe(400);
    expect(service.start).not.toHaveBeenCalled();
  });

  it("reports a server error", async () => {
    service.start.mockRejectedValue(new Error("db down"));
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
    service.start.mockRejectedValue("odd");
    expect((await POST(post())).status).toBe(500);
  });
});
