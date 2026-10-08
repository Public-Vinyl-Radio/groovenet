import { describe, it, expect, vi, beforeEach } from "vitest";

const service = vi.hoisted(() => ({
  retryFailedJobs: vi.fn(),
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: service,
}));

import { POST } from "../route";

function post(body?: unknown): Request {
  return new Request("http://app/api/embeddings/queue/retry", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.retryFailedJobs.mockResolvedValue({ retried: [], not_found: [] });
});

describe("POST /api/embeddings/queue/retry", () => {
  it("retries the given ids and returns the result", async () => {
    service.retryFailedJobs.mockResolvedValueOnce({ retried: ["a", "b"], not_found: [] });

    const res = await POST(post({ ids: ["a", "b"] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retried: ["a", "b"], not_found: [] });
    expect(service.retryFailedJobs).toHaveBeenCalledWith(["a", "b"]);
  });

  it("rejects a missing ids array with 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(service.retryFailedJobs).not.toHaveBeenCalled();
  });

  it("rejects an empty ids array with 400", async () => {
    const res = await POST(post({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects a body that isn't JSON with 400", async () => {
    const res = await POST(
      new Request("http://app/api/embeddings/queue/retry", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
  });

  it("reports a lookup failure as 500", async () => {
    service.retryFailedJobs.mockRejectedValue(new Error("redis is gone"));
    const res = await POST(post({ ids: ["a"] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("redis is gone");
  });

  it("stringifies a non-Error rejection", async () => {
    service.retryFailedJobs.mockRejectedValue("redis is gone");
    const res = await POST(post({ ids: ["a"] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("redis is gone");
  });

  it("falls back to a generic message for an empty Error message", async () => {
    service.retryFailedJobs.mockRejectedValue(new Error(""));
    const res = await POST(post({ ids: ["a"] }));
    expect((await res.json()).error).toBe("Failed to retry failed embedding jobs");
  });
});
