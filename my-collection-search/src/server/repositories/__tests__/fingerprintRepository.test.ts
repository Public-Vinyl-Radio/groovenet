import { describe, it, expect, vi, beforeEach } from "vitest";
import { FingerprintRepository } from "../fingerprintRepository";
import type {
  FingerprintIndexScope,
  TrackFingerprintRow,
} from "@/types/fingerprint";

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
    audio_size_bytes: 41_234_567,
    audio_mtime_ms: 1_790_000_000_000,
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

  it("stores the audio's size and mtime, and refreshes them on conflict (#303)", async () => {
    dbQuery.mockResolvedValue({ rows: [makeRow()] });

    await makeRepo().upsertFingerprint({
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([1]),
      audio_sha256: "a".repeat(64),
      audio_size_bytes: 41_234_567,
      audio_mtime_ms: 1_790_000_000_000,
    });

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("audio_size_bytes       = EXCLUDED.audio_size_bytes");
    expect(sql).toContain("audio_mtime_ms         = EXCLUDED.audio_mtime_ms");
    expect(params.slice(7)).toEqual([41_234_567, 1_790_000_000_000]);
  });

  it("stores null stats when none are given", async () => {
    dbQuery.mockResolvedValue({ rows: [makeRow()] });
    await makeRepo().upsertFingerprint({
      track_id: "t1", friend_id: 1, fingerprint_type: "chromaprint", fingerprint_version: "1",
      fingerprint_data: null, audio_sha256: "a".repeat(64),
    });
    expect(dbQuery.mock.calls[0][1].slice(7)).toEqual([null, null]);
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

// ─── listIndexCandidates ──────────────────────────────────────────────────────

describe("listIndexCandidates()", () => {
  const engine = { fingerprint_type: "chromaprint", fingerprint_version: "1" };

  function sqlFor(scope: FingerprintIndexScope) {
    dbQuery.mockResolvedValue({ rows: [] });
    return makeRepo()
      .listIndexCandidates(scope, engine)
      .then(() => ({
        sql: dbQuery.mock.calls[0][0] as string,
        params: dbQuery.mock.calls[0][1] as unknown[],
      }));
  }

  it("returns candidates stamped with the stored hash", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        {
          track_id: "t1",
          friend_id: 1,
          local_audio_url: "artist - title.m4a",
          stored_audio_sha256: null,
        },
      ],
    });

    const result = await makeRepo().listIndexCandidates({ kind: "missing" }, engine);

    expect(result).toEqual([
      {
        track_id: "t1",
        friend_id: 1,
        local_audio_url: "artist - title.m4a",
        stored_audio_sha256: null,
      },
    ]);
  });

  it("pins the join to the active engine and version", async () => {
    const { sql, params } = await sqlFor({ kind: "all" });

    expect(sql).toContain("f.fingerprint_type = $1");
    expect(sql).toContain("f.fingerprint_version = $2");
    expect(params.slice(0, 2)).toEqual(["chromaprint", "1"]);
  });

  it("never offers a track without local audio", async () => {
    const { sql } = await sqlFor({ kind: "all" });

    expect(sql).toContain("t.local_audio_url IS NOT NULL");
    expect(sql).toContain("t.local_audio_url <> ''");
  });

  it("excludes soft-deleted tracks", async () => {
    const { sql } = await sqlFor({ kind: "all" });
    expect(sql).toContain("t.deleted_at IS NULL");
  });

  // ── the scope flags ──

  it("--missing takes only tracks with no row for this engine", async () => {
    const { sql } = await sqlFor({ kind: "missing" });
    expect(sql).toContain("f.track_id IS NULL");
  });

  it("--changed takes only tracks already indexed", async () => {
    // The hash comparison itself happens in the worker, which is the only side
    // that can read the file.
    const { sql } = await sqlFor({ kind: "changed" });
    expect(sql).toContain("f.track_id IS NOT NULL");
  });

  it("--all takes every track with audio, indexed or not", async () => {
    const { sql } = await sqlFor({ kind: "all" });
    expect(sql).not.toContain("f.track_id IS NULL");
    expect(sql).not.toContain("f.track_id IS NOT NULL");
  });

  it("--track narrows to one track", async () => {
    const { sql, params } = await sqlFor({ kind: "track", track_id: "t1" });
    expect(sql).toContain("t.track_id = $3");
    expect(params).toEqual(["chromaprint", "1", "t1"]);
  });

  it("--track can be narrowed further by friend", async () => {
    const { sql, params } = await sqlFor({
      kind: "track",
      track_id: "t1",
      friend_id: 2,
    });
    expect(sql).toContain("t.friend_id = $4");
    expect(params).toEqual(["chromaprint", "1", "t1", 2]);
  });

  it("--release narrows to one release", async () => {
    const { sql, params } = await sqlFor({ kind: "release", release_id: "r9" });
    expect(sql).toContain("t.release_id = $3");
    expect(params).toEqual(["chromaprint", "1", "r9"]);
  });

  it("--release can be narrowed further by friend", async () => {
    const { params } = await sqlFor({
      kind: "release",
      release_id: "r9",
      friend_id: 3,
    });
    expect(params).toEqual(["chromaprint", "1", "r9", 3]);
  });
});

// ─── countIndexCandidates ─────────────────────────────────────────────────────

describe("countIndexCandidates()", () => {
  const engine = { fingerprint_type: "chromaprint", fingerprint_version: "1" };

  it("counts using the same scope rules as listIndexCandidates", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "29" }] });

    const result = await makeRepo().countIndexCandidates({ kind: "missing" }, engine);

    expect(result).toBe(29);
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("f.track_id IS NULL");
    expect(sql).toContain("t.local_audio_url IS NOT NULL");
    expect(sql).toContain("COUNT(*)");
  });

  it("pins the join to the active engine and version", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "0" }] });

    await makeRepo().countIndexCandidates({ kind: "all" }, engine);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("f.fingerprint_type = $1");
    expect(sql).toContain("f.fingerprint_version = $2");
    expect(params.slice(0, 2)).toEqual(["chromaprint", "1"]);
  });

  it("treats an empty result as zero", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await makeRepo().countIndexCandidates({ kind: "missing" }, engine)).toBe(0);
  });

  it("narrows to one track, matching --track's scope", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "1" }] });

    await makeRepo().countIndexCandidates({ kind: "track", track_id: "t1" }, engine);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("t.track_id = $3");
    expect(params).toEqual(["chromaprint", "1", "t1"]);
  });
});

// ─── countUnindexableTracks ───────────────────────────────────────────────────

describe("countUnindexableTracks()", () => {
  it("counts tracks with no local audio", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "241" }] });

    const result = await makeRepo().countUnindexableTracks({ kind: "all" });

    expect(result).toBe(241);
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("local_audio_url IS NULL OR local_audio_url = ''");
  });

  it("treats an empty result as zero", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await makeRepo().countUnindexableTracks({ kind: "all" })).toBe(0);
  });

  it("is always zero for --changed", async () => {
    // A track with no audio has never been indexed, so it cannot be in the
    // already-indexed set. Counting it would be noise.
    expect(await makeRepo().countUnindexableTracks({ kind: "changed" })).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("narrows to a track", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "1" }] });
    await makeRepo().countUnindexableTracks({ kind: "track", track_id: "t1" });
    expect(dbQuery.mock.calls[0][1]).toEqual(["t1"]);
  });

  it("narrows to a track and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "1" }] });
    await makeRepo().countUnindexableTracks({
      kind: "track",
      track_id: "t1",
      friend_id: 5,
    });
    expect(dbQuery.mock.calls[0][1]).toEqual(["t1", 5]);
  });

  it("narrows to a release without a friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "2" }] });
    await makeRepo().countUnindexableTracks({ kind: "release", release_id: "r9" });
    expect(dbQuery.mock.calls[0][1]).toEqual(["r9"]);
  });

  it("narrows to a release and friend", async () => {
    dbQuery.mockResolvedValue({ rows: [{ count: "3" }] });
    await makeRepo().countUnindexableTracks({
      kind: "release",
      release_id: "r9",
      friend_id: 2,
    });
    expect(dbQuery.mock.calls[0][1]).toEqual(["r9", 2]);
  });
});

// ─── recordFileStats (#303) ───────────────────────────────────────────────────

describe("recordFileStats()", () => {
  const input = {
    track_id: "t1",
    friend_id: 1,
    fingerprint_type: "chromaprint" as const,
    fingerprint_version: "1",
    audio_sha256: "a".repeat(64),
    audio_size_bytes: 41_234_567,
    audio_mtime_ms: 1_790_000_000_000,
  };

  it("updates only the row whose stored hash still matches", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    expect(await makeRepo().recordFileStats(input)).toBe(true);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("AND audio_sha256 = $5");
    expect(sql).not.toContain("fingerprint_data");
    expect(params).toEqual(["t1", 1, "chromaprint", "1", "a".repeat(64), 41_234_567, 1_790_000_000_000]);
  });

  it("reports false when the hash no longer matches", async () => {
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await makeRepo().recordFileStats(input)).toBe(false);
  });

  it("treats a missing row count as nothing updated", async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    expect(await makeRepo().recordFileStats(input)).toBe(false);
  });
});
