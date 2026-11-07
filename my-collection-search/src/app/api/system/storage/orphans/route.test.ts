import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({ getOrphans: vi.fn(), startOrphanScan: vi.fn() }));
vi.mock("@/server/services/storageOrphanService", () => svc);

import { GET } from "./route";
import { POST } from "./scan/route";

const page = { items: [], total: 0, limit: 10, offset: 0 };
const ok = { running: false, last_scan: null, last_error: null, files: page, tracks: page };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/system/storage/orphans", () => {
  it("returns the latest scan with defaults applied", async () => {
    svc.getOrphans.mockResolvedValue(ok);
    const res = await GET(new Request("http://x/api/system/storage/orphans"));
    expect(res.status).toBe(200);
    expect(svc.getOrphans).toHaveBeenCalledWith({ limit: 10, files_offset: 0, tracks_offset: 0 });
    expect(await res.json()).toEqual(ok);
  });

  it("passes paging through", async () => {
    svc.getOrphans.mockResolvedValue(ok);
    await GET(new Request("http://x/?limit=50&files_offset=100&tracks_offset=7"));
    expect(svc.getOrphans).toHaveBeenCalledWith({ limit: 50, files_offset: 100, tracks_offset: 7 });
  });

  it("rejects a bad query", async () => {
    const res = await GET(new Request("http://x/?limit=0"));
    expect(res.status).toBe(400);
    expect(svc.getOrphans).not.toHaveBeenCalled();
  });

  it("is a 500 when reading fails", async () => {
    svc.getOrphans.mockRejectedValue(new Error("db"));
    expect((await GET(new Request("http://x/"))).status).toBe(500);
  });
});

describe("POST /api/system/storage/orphans/scan", () => {
  it("accepts the scan", async () => {
    svc.startOrphanScan.mockReturnValue({ started: true, running: true });
    const res = await POST();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ started: true, running: true });
  });

  it("is a 500 when starting throws", async () => {
    svc.startOrphanScan.mockImplementation(() => {
      throw new Error("nope");
    });
    expect((await POST()).status).toBe(500);
  });
});
