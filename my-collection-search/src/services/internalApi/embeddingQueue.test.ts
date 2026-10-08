import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({ http: httpMock }));

import { fetchEmbeddingQueueStatus, retryFailedEmbeddingJobs } from "./embeddingQueue";

beforeEach(() => {
  httpMock.mockReset();
  httpMock.mockResolvedValue({ ok: true });
});

describe("fetchEmbeddingQueueStatus", () => {
  it("GETs the queue status with no caching", async () => {
    await expect(fetchEmbeddingQueueStatus()).resolves.toEqual({ ok: true });
    expect(httpMock).toHaveBeenCalledWith("/api/embeddings/queue", {
      method: "GET",
      cache: "no-store",
    });
  });
});

describe("retryFailedEmbeddingJobs", () => {
  it("POSTs the selected ids as JSON", async () => {
    await retryFailedEmbeddingJobs(["a", "b"]);
    expect(httpMock).toHaveBeenCalledWith("/api/embeddings/queue/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["a", "b"] }),
    });
  });
});
