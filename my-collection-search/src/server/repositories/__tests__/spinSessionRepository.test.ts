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

  it("keeps manual sessions manual when automatic metadata is absent", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 2 }] });
    await repo.createSession({ query }, { friend_id: 1, release_id: "rel", selection_mode: "tracks", played_at: "2026-01-01" });
    expect(query.mock.calls[0][1].slice(-4)).toEqual(["manual", null, null, null]);
  });

  it("looks up the source detection to make a replay a no-op", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.findAutomaticSessionByDetectionId("d1")).resolves.toEqual({ id: 1 });
    await expect(repo.findAutomaticSessionByDetectionId("missing")).resolves.toBeNull();
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("detection_id = $1"), ["d1"]);
  });
});

describe("SpinSessionRepository.listSessions", () => {
  const repo = new SpinSessionRepository();
  beforeEach(() => vi.resetAllMocks());

  it("joins the album and groups by the columns it selects", async () => {
    const row = { id: 1, album_title: "Algo-Ritmo", track_event_count: 2 };
    dbQuery.mockResolvedValueOnce({ rows: [row] });

    await expect(repo.listSessions({ friend_id: 7 })).resolves.toEqual([row]);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/LEFT JOIN albums a\s+ON a\.release_id = ss\.release_id AND a\.friend_id = ss\.friend_id/);
    expect(sql).toMatch(/GROUP BY ss\.id, a\.title, a\.artist, a\.album_thumbnail/);
    expect(params).toEqual([7, 50, 0]);
  });

  it("adds each filter as its own parameter, before the paging ones", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    await repo.listSessions({
      friend_id: 7,
      release_id: "rel",
      track_id: "trk",
      from: "2026-09-01",
      to: "2026-09-30",
      limit: 10,
      offset: 20,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("ss.release_id = $2");
    expect(sql).toContain("tse_filter.track_id = $3");
    expect(sql).toContain("ss.played_at >= $4");
    expect(sql).toContain("ss.played_at <= $5");
    expect(params).toEqual([7, "rel", "trk", "2026-09-01", "2026-09-30", 10, 20]);
  });
});

describe("SpinSessionRepository edits", () => {
  const repo = new SpinSessionRepository();
  beforeEach(() => vi.resetAllMocks());

  it("locks the friend's session for the transaction", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 3 }] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.findSessionForUpdate({ query }, 3, 1)).resolves.toEqual({ id: 3 });
    await expect(repo.findSessionForUpdate({ query }, 3, 2)).resolves.toBeNull();
    expect(query.mock.calls[0][0]).toMatch(/WHERE id = \$1 AND friend_id = \$2 FOR UPDATE/);
    expect(query.mock.calls[0][1]).toEqual([3, 1]);
  });

  it("sets only the given fields, and stamps corrected_at when asked", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });
    await repo.updateSession({ query }, 3, {
      selection_mode: "tracks",
      played_at: "2026-09-20T20:00:00.000Z",
      note: null,
      context_type: "home",
      mark_corrected: true,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      "SET updated_at = NOW(), selection_mode = $2, played_at = $3, note = $4, context_type = $5, corrected_at = NOW() WHERE id = $1"
    );
    expect(params).toEqual([3, "tracks", "2026-09-20T20:00:00.000Z", null, "home"]);
  });

  it("touches only updated_at when nothing else is given", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });
    await repo.updateSession({ query }, 3, { mark_corrected: false });
    expect(query.mock.calls[0][0]).toContain("SET updated_at = NOW() WHERE id = $1");
    expect(query.mock.calls[0][1]).toEqual([3]);
  });

  it("clears a session's selections", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await repo.deleteSelections({ query }, 3);
    expect(query).toHaveBeenCalledWith(
      "DELETE FROM spin_session_selections WHERE session_id = $1",
      [3]
    );
  });
});
