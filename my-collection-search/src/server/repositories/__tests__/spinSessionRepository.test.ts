import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { SpinSessionRepository } from "../spinSessionRepository";

describe("SpinSessionRepository automatic sessions", () => {
  const repo = new SpinSessionRepository();
  beforeEach(() => vi.resetAllMocks());

  it("persists automatic provenance with its idempotency key", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    await repo.createSession({ query }, { friend_id: 1, release_id: "rel", selection_mode: "automatic", played_at: "2026-01-01", provenance: "automatic", source_id: "pi", detection_id: "d1", confidence: 0.9 });
    expect(query.mock.calls[0][0]).toMatch(/provenance, source_id, detection_id, confidence/);
    expect(query.mock.calls[0][1].slice(-4)).toEqual(["automatic", "pi", "d1", 0.9]);
  });

  it("looks up the source detection to make a replay a no-op", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.findAutomaticSessionByDetectionId("d1")).resolves.toEqual({ id: 1 });
    await expect(repo.findAutomaticSessionByDetectionId("missing")).resolves.toBeNull();
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("detection_id = $1"), ["d1"]);
  });
});
