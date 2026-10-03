import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({ listTracksForBackfill: vi.fn() }));
const queue = vi.hoisted(() => ({ startBackfillRun: vi.fn() }));

vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: repo,
}));
vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: queue,
}));

import { POST } from "../route";

function post(body?: unknown): Request {
  return new Request("http://app/api/embeddings/backfill", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function refs(type: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({ track_id: `${type}-${i}`, friend_id: 1 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  repo.listTracksForBackfill.mockResolvedValue([]);
  queue.startBackfillRun.mockResolvedValue({
    run_id: "run-1",
    queued: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    started_at: 1,
    updated_at: 1,
    complete: true,
  });
});

describe("POST /api/embeddings/backfill", () => {
  it("defaults to scope=missing across all three types with no body at all", async () => {
    const res = await POST(post(undefined));

    expect(res.status).toBe(202);
    expect(repo.listTracksForBackfill).toHaveBeenCalledTimes(3);
    for (const type of ["identity", "audio_vibe", "prompt"]) {
      expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
        expect.objectContaining({ type, force: false })
      );
    }
  });

  it("queues a run and returns 202 with its totals", async () => {
    queue.startBackfillRun.mockResolvedValueOnce({
      run_id: "run-2",
      queued: 5,
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      started_at: 1,
      updated_at: 1,
      complete: false,
    });

    const res = await POST(post({ scope: "missing" }));

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ run_id: "run-2", queued: 5 });
  });

  it("narrows to the requested types", async () => {
    await POST(post({ types: ["identity"] }));

    expect(repo.listTracksForBackfill).toHaveBeenCalledTimes(1);
    expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ type: "identity" })
    );
  });

  it("scope=all forces every candidate regardless of an explicit force flag", async () => {
    await POST(post({ scope: "all" }));

    expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  it("scope=release only fills what's missing unless force is set", async () => {
    await POST(post({ scope: "release", release_id: "rel-1" }));
    expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ release_id: "rel-1", force: false })
    );

    await POST(post({ scope: "release", release_id: "rel-1", force: true }));
    expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ release_id: "rel-1", force: true })
    );
  });

  it("rejects scope=release with no release_id", async () => {
    const res = await POST(post({ scope: "release" }));
    expect(res.status).toBe(400);
    expect(queue.startBackfillRun).not.toHaveBeenCalled();
  });

  it("scope=track passes track_ids through", async () => {
    await POST(post({ scope: "track", track_ids: ["t1", "t2"] }));
    expect(repo.listTracksForBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ track_ids: ["t1", "t2"] })
    );
  });

  it("rejects scope=track with no track_ids", async () => {
    const res = await POST(post({ scope: "track" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown scope with 400", async () => {
    const res = await POST(post({ scope: "everything" }));
    expect(res.status).toBe(400);
    expect(queue.startBackfillRun).not.toHaveBeenCalled();
  });

  it("tags every job with its kind and enqueues the combined list", async () => {
    repo.listTracksForBackfill.mockImplementation(async ({ type }: { type: string }) =>
      type === "identity" ? refs("identity", 2) : []
    );

    await POST(post({ types: ["identity", "audio_vibe"] }));

    expect(queue.startBackfillRun).toHaveBeenCalledWith([
      { track_id: "identity-0", friend_id: 1, kind: "identity", force: false },
      { track_id: "identity-1", friend_id: 1, kind: "identity", force: false },
    ]);
  });

  it("dry_run reports counts per type and never enqueues", async () => {
    repo.listTracksForBackfill.mockImplementation(async ({ type }: { type: string }) => {
      if (type === "identity") return refs("identity", 3);
      if (type === "audio_vibe") return refs("audio_vibe", 1);
      return [];
    });

    const res = await POST(post({ dry_run: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dry_run: true,
      total: 4,
      by_type: { identity: 3, audio_vibe: 1, prompt: 0 },
    });
    expect(queue.startBackfillRun).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure as 500", async () => {
    repo.listTracksForBackfill.mockRejectedValue(new Error("db is gone"));

    const res = await POST(post({}));

    expect(res.status).toBe(500);
  });
});
