import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ getRun: vi.fn() }));
vi.mock("@/server/services/audioMetadataBackfillService", () => ({
  audioMetadataBackfillService: service,
}));

import { GET } from "../route";

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
const req = new Request("http://app/api/tracks/audio-metadata/backfill/r1");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/tracks/audio-metadata/backfill/{runId}", () => {
  it("returns the run", async () => {
    service.getRun.mockResolvedValue({
      run_id: "r1",
      total: 1,
      probed: 1,
      skipped: 0,
      missing_files: 0,
      probe_failures: 0,
      sources: { apple_music: 1, youtube: 0, soundcloud: 0, upload: 0, unknown: 0 },
      weak_youtube_hints: 0,
      errors: [],
      started_at: 1,
      updated_at: 2,
      complete: true,
    });
    const res = await GET(req, ctx("r1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ complete: true });
  });

  it("404s an unknown run", async () => {
    service.getRun.mockResolvedValue(null);
    expect((await GET(req, ctx("zz"))).status).toBe(404);
  });

  it("500s when reading fails", async () => {
    service.getRun.mockRejectedValue(new Error("redis"));
    expect((await GET(req, ctx("r1"))).status).toBe(500);
    service.getRun.mockRejectedValue("odd");
    expect((await GET(req, ctx("r1"))).status).toBe(500);
  });
});
