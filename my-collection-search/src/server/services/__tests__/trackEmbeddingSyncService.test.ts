import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnqueue } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue: mockEnqueue },
}));

import { syncIdentityEmbeddings } from "../trackEmbeddingSyncService";

const refs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ track_id: `t${i}`, friend_id: 1 }));

beforeEach(() => {
  vi.resetAllMocks();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("syncIdentityEmbeddings", () => {
  it("enqueues an identity and a context job per track and reports the track count", async () => {
    const result = await syncIdentityEmbeddings(refs(2));

    expect(result).toEqual({ queued: 2 });
    expect(mockEnqueue).toHaveBeenCalledWith([
      { track_id: "t0", friend_id: 1, kind: "identity" },
      { track_id: "t0", friend_id: 1, kind: "context" },
      { track_id: "t1", friend_id: 1, kind: "identity" },
      { track_id: "t1", friend_id: 1, kind: "context" },
    ], "sync");
  });

  it("does nothing for an empty list", async () => {
    expect(await syncIdentityEmbeddings([])).toEqual({ queued: 0 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
