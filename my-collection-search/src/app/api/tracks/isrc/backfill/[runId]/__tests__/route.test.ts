import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ getRun: vi.fn() }));
vi.mock("@/server/services/isrcService", () => ({
  isrcService: service,
}));

import { GET } from "../route";

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
const req = new Request("http://app/api/tracks/isrc/backfill/r1");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/tracks/isrc/backfill/{runId}", () => {
  it("returns the run", async () => {
    service.getRun.mockResolvedValue({
      run_id: "r1",
      total: 2,
      filled: 0,
      skipped: 0,
      no_link: 0,
      not_found: 0,
      failed: 0,
      dry_run: false,
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
