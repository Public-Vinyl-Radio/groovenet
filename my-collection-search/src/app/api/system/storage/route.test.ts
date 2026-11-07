import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStorage: vi.fn() }));
vi.mock("@/server/services/storageService", () => ({
  storageService: { getStorage: mocks.getStorage },
}));

import { GET } from "./route";

describe("GET /api/system/storage", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the storage summary", async () => {
    mocks.getStorage.mockResolvedValue({ totals: { files: 2 } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totals: { files: 2 } });
  });

  it("returns 500 when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getStorage.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to read storage" });
  });
});
