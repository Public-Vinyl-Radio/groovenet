import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateIdentity } = vi.hoisted(() => ({
  mockGenerateIdentity: vi.fn(),
}));

vi.mock("@/lib/identity-embedding", () => ({
  generateAndStoreIdentityEmbedding: mockGenerateIdentity,
}));

import { syncIdentityEmbeddings } from "../trackEmbeddingSyncService";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ track_id: `t${i}`, friend_id: 1 }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncIdentityEmbeddings", () => {
  it("counts generated and unchanged tracks", async () => {
    mockGenerateIdentity
      .mockResolvedValueOnce({ updated: true, reason: "ok" })
      .mockResolvedValueOnce({ updated: false, reason: "Source hash unchanged" });

    const result = await syncIdentityEmbeddings(refs(2));

    expect(result).toEqual({ generated: 1, unchanged: 1, failed: 0 });
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t0", 1);
    expect(mockGenerateIdentity).toHaveBeenCalledWith("t1", 1);
  });

  it("never throws: a failing track is counted and the rest still run", async () => {
    mockGenerateIdentity
      .mockRejectedValueOnce(new Error("embedding provider down"))
      .mockResolvedValue({ updated: true, reason: "ok" });

    const result = await syncIdentityEmbeddings(refs(3));

    expect(result).toEqual({ generated: 2, unchanged: 0, failed: 1 });
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(3);
  });

  it("limits how many embeddings run at once", async () => {
    let inFlight = 0;
    let peak = 0;
    mockGenerateIdentity.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { updated: true, reason: "ok" };
    });

    await syncIdentityEmbeddings(refs(9), 3);

    expect(peak).toBeLessThanOrEqual(3);
    expect(mockGenerateIdentity).toHaveBeenCalledTimes(9);
  });

  it("does nothing for an empty list", async () => {
    expect(await syncIdentityEmbeddings([])).toEqual({
      generated: 0,
      unchanged: 0,
      failed: 0,
    });
    expect(mockGenerateIdentity).not.toHaveBeenCalled();
  });
});
