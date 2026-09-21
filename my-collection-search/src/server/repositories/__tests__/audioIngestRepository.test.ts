import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { AudioIngestRepository } from "../audioIngestRepository";

const repo = () => new AudioIngestRepository();

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AudioIngestRepository.create", () => {
  it("inserts a received ingest with generated id and received timestamp", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "ingest-id", source_id: "listener-1" }] });

    await expect(repo().create({ source_id: "listener-1" })).resolves.toEqual({
      id: "ingest-id", source_id: "listener-1",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audio_ingests/);
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(params.slice(1, 6)).toEqual(["listener-1", null, null, null, expect.any(Date)]);
    expect(params[11]).toBe("received");
  });

  it("persists all supplied metadata", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "provided-id" }] });
    await repo().create({
      id: "provided-id", source_id: "listener-1", session_id: "session-1", sequence: 4,
      captured_at: "2026-09-20T12:00:00Z", received_at: "2026-09-20T12:01:00Z",
      duration_seconds: 10.5, sample_rate: 48_000, channels: 2, codec: "opus",
      file_path: "/audio/chunk.opus", status: "processing", error: "retrying",
    });
    expect(dbQuery.mock.calls[0][1]).toEqual([
      "provided-id", "listener-1", "session-1", 4, "2026-09-20T12:00:00Z",
      "2026-09-20T12:01:00Z", 10.5, 48_000, 2, "opus", "/audio/chunk.opus",
      "processing", "retrying",
    ]);
  });
});

describe("AudioIngestRepository.updateStatus", () => {
  it("updates status, error, and updated_at", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "ingest-id", status: "failed" }] });
    await expect(repo().updateStatus("ingest-id", "failed", "invalid codec")).resolves.toEqual({
      id: "ingest-id", status: "failed",
    });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/updated_at = current_timestamp/);
    expect(params).toEqual(["ingest-id", "failed", "invalid codec"]);
  });

  it("returns null when the ingest does not exist", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().updateStatus("missing", "processed")).resolves.toBeNull();
  });
});

describe("AudioIngestRepository lookups", () => {
  it("finds an ingest by its complete dedupe key", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "ingest-id" }] });
    await expect(repo().findByDedupeKey("listener-1", "session-1", 3)).resolves.toEqual({ id: "ingest-id" });
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/source_id = \$1 AND session_id = \$2 AND sequence = \$3/);
    expect(params).toEqual(["listener-1", "session-1", 3]);
  });

  it("returns null for a missing dedupe key", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repo().findByDedupeKey("listener-1", "session-1", 3)).resolves.toBeNull();
  });

  it("lists a source's history newest first with pagination", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: "new" }, { id: "old" }] });
    await expect(repo().listBySource("listener-1", { limit: 20, offset: 5 })).resolves.toEqual([
      { id: "new" }, { id: "old" },
    ]);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY received_at DESC, id DESC/);
    expect(params).toEqual(["listener-1", 20, 5]);
  });

  it("uses bounded defaults for source history", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await repo().listBySource("listener-1");
    expect(dbQuery.mock.calls[0][1]).toEqual(["listener-1", 50, 0]);
  });
});

// ─── findByFilePaths (#269) ───────────────────────────────────────────────────

describe("findByFilePaths()", () => {
  it("returns the records claiming those files", async () => {
    const row = { id: "a", file_path: "chunk.wav", status: "processed" };
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await new AudioIngestRepository().findByFilePaths(["chunk.wav"]);

    expect(result).toEqual([row]);
    expect(dbQuery.mock.calls[0][0]).toContain("file_path = ANY($1::text[])");
    expect(dbQuery.mock.calls[0][1]).toEqual([["chunk.wav"]]);
  });

  it("never queries for an empty directory", async () => {
    // The sweeper calls this on every tick; an empty volume should cost nothing.
    expect(await new AudioIngestRepository().findByFilePaths([])).toEqual([]);
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

// ─── lifecycle queries (#276) ─────────────────────────────────────────────────

describe("findById()", () => {
  it("returns the ingest", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "a", status: "received" }] });
    expect(await new AudioIngestRepository().findById("a")).toMatchObject({ id: "a" });
  });

  it("returns null when there is none", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await new AudioIngestRepository().findById("a")).toBeNull();
  });
});

describe("listStale()", () => {
  it("looks for both non-terminal states by default", async () => {
    // `received` means nothing picked it up; `processing` means something did
    // and never came back. Both strand a file.
    dbQuery.mockResolvedValue({ rows: [] });
    const cutoff = new Date("2026-09-20T12:00:00Z");

    await new AudioIngestRepository().listStale(cutoff);

    expect(dbQuery.mock.calls[0][1]).toEqual([
      ["received", "processing"],
      cutoff,
      500,
    ]);
  });

  it("compares against updated_at, not received_at", async () => {
    // A chunk claimed five minutes ago has been in flight five minutes, not
    // however long since it was uploaded.
    dbQuery.mockResolvedValue({ rows: [] });
    await new AudioIngestRepository().listStale(new Date());
    expect(dbQuery.mock.calls[0][0]).toContain("updated_at <");
  });

  it("takes the oldest first, bounded", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    await new AudioIngestRepository().listStale(new Date(), ["processing"], 10);
    expect(dbQuery.mock.calls[0][0]).toContain("ORDER BY updated_at ASC");
    expect(dbQuery.mock.calls[0][1][2]).toBe(10);
  });

  it("returns the rows", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "a" }, { id: "b" }] });
    expect(await new AudioIngestRepository().listStale(new Date())).toHaveLength(2);
  });
});

describe("transitionStatus()", () => {
  it("only moves an ingest out of an expected state", async () => {
    // The guard is what makes the reaper safe beside a live worker.
    dbQuery.mockResolvedValue({ rows: [{ id: "a", status: "failed" }] });

    await new AudioIngestRepository().transitionStatus("a", "failed", ["processing"], "stalled");

    expect(dbQuery.mock.calls[0][0]).toContain("status = ANY($4::text[])");
    expect(dbQuery.mock.calls[0][1]).toEqual(["a", "failed", "stalled", ["processing"]]);
  });

  it("returns null when the ingest had already moved on", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await new AudioIngestRepository().transitionStatus(
      "a",
      "failed",
      ["processing"]
    );

    expect(result).toBeNull();
  });

  it("clears the error when none is given", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "a" }] });
    await new AudioIngestRepository().transitionStatus("a", "processed", ["processing"]);
    expect(dbQuery.mock.calls[0][1][2]).toBeNull();
  });

  it("stamps updated_at so the reaper's clock restarts", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: "a" }] });
    await new AudioIngestRepository().transitionStatus("a", "processing", ["received"]);
    expect(dbQuery.mock.calls[0][0]).toContain("updated_at = current_timestamp");
  });
});
