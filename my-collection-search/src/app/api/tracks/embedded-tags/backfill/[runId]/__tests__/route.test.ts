import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ getRun: vi.fn() }));
vi.mock("@/server/services/embeddedTagsBackfillService", () => ({
  embeddedTagsBackfillService: service,
}));

import { GET } from "../route";

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
const req = new Request("http://app/api/tracks/embedded-tags/backfill/r1");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/tracks/embedded-tags/backfill/{runId}", () => {
  it("returns the run", async () => {
    service.getRun.mockResolvedValue({
      run_id: "r1",
      total: 2,
      read: 0,
      skipped: 0,
      missing_files: 0,
      read_failures: 0,
      with_composer: 0,
      with_genre: 0,
      with_lyrics: 0,
      queued_embeddings: 0,
      errors: [],
      started_at: 1,
      updated_at: 1,
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

  it("falls back to a generic message when the error has none", async () => {
    service.getRun.mockRejectedValue(new Error(""));
    const res = await GET(req, ctx("r1"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to/);
  });
});
