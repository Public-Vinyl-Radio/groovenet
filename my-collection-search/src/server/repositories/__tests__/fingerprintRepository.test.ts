import { describe, it, expect, vi, beforeEach } from "vitest";
import { FingerprintRepository } from "../fingerprintRepository";
import type { TrackFingerprintRow } from "@/types/fingerprint";

const dbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery }));

beforeEach(() => {
  vi.resetAllMocks();
});

function makeRepo() {
  return new FingerprintRepository();
}

function makeRow(overrides: Partial<TrackFingerprintRow> = {}): TrackFingerprintRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    track_id: "t1",
    friend_id: 1,
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    fingerprint_data: Buffer.from([1, 2, 3]),
    audio_sha256: "a".repeat(64),
    audio_duration_seconds: 321.5,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

// ─── upsertFingerprint ────────────────────────────────────────────────────────

describe("upsertFingerprint()", () => {
  it("returns the stored row", async () => {
    const row = makeRow();
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await makeRepo().upsertFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: row.fingerprint_data,
      audio_sha256: row.audio_sha256,
      audio_duration_seconds: 321.5,
    });

    expect(result).toEqual(row);
  });

  it("conflicts on the full type+version key, so engines and versions coexist", async () => {
    dbQuery.mockResolvedValue({ rows: [makeRow()] });

    await makeRepo().upsertFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "panako",
      fingerprint_version: "2",
      fingerprint_data: Buffer.from([9]),
      audio_sha256: "b".repeat(64),
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain(
      "ON CONFLICT (track_id, friend_id, fingerprint_type, fingerprint_version)"
    );
    expect(params.slice(0, 4)).toEqual(["t1", 1, "panako", "2"]);
  });

  it("refreshes the payload and invalidation inputs on conflict", async () => {
    dbQuery.mockResolvedValue({ rows: [makeRow()] });

    await makeRepo().upsertFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([7]),
      audio_sha256: "c".repeat(64),
    });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_data       = EXCLUDED.fingerprint_data");
    expect(sql).toContain("audio_sha256           = EXCLUDED.audio_sha256");
    expect(sql).toContain("updated_at             = CURRENT_TIMESTAMP");
    // The key columns are never rewritten — that would move the row.
    expect(sql).not.toContain("fingerprint_version    = EXCLUDED");
  });

  it("defaults a missing duration to null rather than undefined", async () => {
    dbQuery.mockResolvedValue({ rows: [makeRow()] });

    await makeRepo().upsertFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: null,
      audio_sha256: "d".repeat(64),
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params[4]).toBeNull();
    expect(params[6]).toBeNull();
  });
});

// ─── findFingerprint ──────────────────────────────────────────────────────────

describe("findFingerprint()", () => {
  it("looks up by the full identity", async () => {
    const row = makeRow();
    dbQuery.mockResolvedValue({ rows: [row] });

    const result = await makeRepo().findFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual(["t1", 1, "chromaprint", "1"]);
    expect(result).toEqual(row);
  });

  it("returns null when nothing is stored", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    const result = await makeRepo().findFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });

    expect(result).toBeNull();
  });
});

// ─── findFingerprintsByAudioSha256 ────────────────────────────────────────────

describe("findFingerprintsByAudioSha256()", () => {
  it("looks up by hash alone when no engine is given", async () => {
    const rows = [makeRow(), makeRow({ fingerprint_type: "panako" })];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().findFingerprintsByAudioSha256("a".repeat(64));

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("audio_sha256 = $1");
    expect(sql).not.toContain("fingerprint_type = $");
    expect(params).toEqual(["a".repeat(64)]);
    expect(result).toEqual(rows);
  });

  it("narrows to one engine when a type is given", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findFingerprintsByAudioSha256("a".repeat(64), {
      fingerprint_type: "chromaprint",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $2");
    expect(sql).not.toContain("fingerprint_version = $");
    expect(params).toEqual(["a".repeat(64), "chromaprint"]);
  });

  it("narrows to one engine version when both are given", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findFingerprintsByAudioSha256("a".repeat(64), {
      fingerprint_type: "chromaprint",
      fingerprint_version: "2",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $2");
    expect(sql).toContain("fingerprint_version = $3");
    expect(params).toEqual(["a".repeat(64), "chromaprint", "2"]);
  });

  it("numbers a lone version filter as $2, not $3", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().findFingerprintsByAudioSha256("a".repeat(64), {
      fingerprint_version: "2",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_version = $2");
    expect(params).toEqual(["a".repeat(64), "2"]);
  });
});

// ─── listFingerprintsForIndex ─────────────────────────────────────────────────

describe("listFingerprintsForIndex()", () => {
  it("selects one engine version and includes the payload", async () => {
    const rows = [makeRow()];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listFingerprintsForIndex({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $1 AND fingerprint_version = $2");
    expect(sql).toContain("fingerprint_data");
    expect(params).toEqual(["chromaprint", "1"]);
    expect(result).toEqual(rows);
  });

  it("appends friend, limit and offset in parameter order", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listFingerprintsForIndex({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      friend_id: 7,
      limit: 50,
      offset: 100,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("friend_id = $3");
    expect(sql).toContain("LIMIT $4");
    expect(sql).toContain("OFFSET $5");
    expect(params).toEqual(["chromaprint", "1", 7, 50, 100]);
  });

  it("keeps friend_id = 0 as a filter rather than dropping it", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listFingerprintsForIndex({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      friend_id: 0,
    });

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual(["chromaprint", "1", 0]);
  });
});

// ─── listFingerprintStatus ────────────────────────────────────────────────────

describe("listFingerprintStatus()", () => {
  it("omits the payload so staleness checks stay cheap", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    await makeRepo().listFingerprintStatus({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
    });

    const [sql] = dbQuery.mock.calls[0];
    expect(sql).toContain("audio_sha256");
    expect(sql).not.toContain("fingerprint_data");
  });

  it("returns the invalidation inputs for each indexed track", async () => {
    const rows = [
      {
        track_id: "t1",
        friend_id: 1,
        fingerprint_type: "chromaprint",
        fingerprint_version: "1",
        audio_sha256: "a".repeat(64),
        audio_duration_seconds: 321.5,
        updated_at: "2026-09-20T00:00:00Z",
      },
    ];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listFingerprintStatus({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      friend_id: 1,
    });

    expect(result).toEqual(rows);
  });
});

// ─── listFingerprintVersionsForTrack ──────────────────────────────────────────

describe("listFingerprintVersionsForTrack()", () => {
  it("reports every engine and version covering a track", async () => {
    const rows = [
      { fingerprint_type: "chromaprint", fingerprint_version: "1" },
      { fingerprint_type: "chromaprint", fingerprint_version: "2" },
      { fingerprint_type: "panako", fingerprint_version: "1" },
    ];
    dbQuery.mockResolvedValue({ rows });

    const result = await makeRepo().listFingerprintVersionsForTrack("t1", 1);

    const [, params] = dbQuery.mock.calls[0];
    expect(params).toEqual(["t1", 1]);
    expect(result).toEqual(rows);
  });
});

// ─── countFingerprints ────────────────────────────────────────────────────────

describe("countFingerprints()", () => {
  it("counts everything when unfiltered", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "3653" }] });

    const result = await makeRepo().countFingerprints();

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).not.toContain("WHERE");
    expect(params).toEqual([]);
    expect(result).toBe(3653);
  });

  it("filters by engine, version and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "12" }] });

    await makeRepo().countFingerprints({
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      friend_id: 7,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $1");
    expect(sql).toContain("fingerprint_version = $2");
    expect(sql).toContain("friend_id = $3");
    expect(params).toEqual(["chromaprint", "1", 7]);
  });

  it("returns 0 when the count comes back empty", async () => {
    dbQuery.mockResolvedValue({ rows: [] });

    expect(await makeRepo().countFingerprints()).toBe(0);
  });
});

// ─── deletes ──────────────────────────────────────────────────────────────────

describe("deleteFingerprintsForTrack()", () => {
  it("drops every engine's fingerprint by default", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 2 });

    const result = await makeRepo().deleteFingerprintsForTrack("t1", 1);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).not.toContain("fingerprint_type = $");
    expect(params).toEqual(["t1", 1]);
    expect(result).toBe(2);
  });

  it("scopes to one engine when given", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await makeRepo().deleteFingerprintsForTrack("t1", 1, "panako");

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $3");
    expect(params).toEqual(["t1", 1, "panako"]);
  });

  it("reports 0 when rowCount is null", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: null });

    expect(await makeRepo().deleteFingerprintsForTrack("t1", 1)).toBe(0);
  });
});

describe("deleteFingerprintsByVersion()", () => {
  it("retires one engine version across the library", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 3653 });

    const result = await makeRepo().deleteFingerprintsByVersion("chromaprint", "1");

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("fingerprint_type = $1 AND fingerprint_version = $2");
    expect(params).toEqual(["chromaprint", "1"]);
    expect(result).toBe(3653);
  });

  it("reports 0 when rowCount is null", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: null });

    expect(await makeRepo().deleteFingerprintsByVersion("chromaprint", "1")).toBe(0);
  });
});
