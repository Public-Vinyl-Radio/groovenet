import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/server/services/isrcService", () => ({
  isrcService: service,
}));

import { POST } from "../route";

const run = {
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
  complete: false,
};

const post = (body?: string) =>
  new Request("http://app/api/tracks/isrc/backfill", { method: "POST", body });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.start.mockResolvedValue(run);
});

describe("POST /api/tracks/isrc/backfill", () => {
  it("starts a run with no body", async () => {
    const res = await POST(post());
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ run_id: "r1", total: 2 });
    expect(service.start).toHaveBeenCalledWith({});
  });

  it("passes every option", async () => {
    await POST(post(JSON.stringify({ force: true, friend_id: 3, limit: 4, dry_run: true })));
    expect(service.start).toHaveBeenCalledWith({
      force: true,
      friend_id: 3,
      limit: 4,
      dry_run: true,
    });
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

  it("falls back to a generic message when the error has none", async () => {
    service.start.mockRejectedValue(new Error(""));
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to/);
  });
});
