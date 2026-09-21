/**
 * The three fingerprint routes (#277).
 *
 * These are the seam `fingerprint-service` posts into and the CLI polls, so the
 * status codes matter as much as the bodies: a 503 tells the CLI the worker is
 * down rather than that indexing failed, and a 409 tells it a track vanished
 * mid-run rather than that the app broke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({
  upsertFingerprint: vi.fn(),
  listFingerprintsForIndex: vi.fn(),
}));
const service = vi.hoisted(() => ({ startRun: vi.fn(), getRun: vi.fn() }));

vi.mock("@/server/repositories/fingerprintRepository", () => ({
  fingerprintRepository: repo,
}));
vi.mock("@/server/services/fingerprintIndexService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/services/fingerprintIndexService")
  >();
  return { ...actual, fingerprintIndexService: service };
});

import { GET as listFingerprints, POST as storeFingerprint } from "../route";
import { POST as startRun } from "../index/route";
import { GET as getRun } from "../index/[runId]/route";
import { NoFingerprintEngineError } from "@/server/services/fingerprintIndexService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function post(body: unknown): Request {
  return new Request("http://app/api/fingerprints", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validUpsert(overrides: Record<string, unknown> = {}) {
  return {
    track_id: "t1",
    friend_id: 1,
    fingerprint_type: "stub",
    fingerprint_version: "0",
    fingerprint_data: null,
    audio_sha256: "e".repeat(64),
    audio_duration_seconds: 212.5,
    ...overrides,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    track_id: "t1",
    friend_id: 1,
    fingerprint_type: "stub",
    fingerprint_version: "0",
    fingerprint_data: null,
    audio_sha256: "e".repeat(64),
    audio_duration_seconds: 212.5,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run-1",
    scope: "missing",
    fingerprint_type: "stub",
    fingerprint_version: "0",
    queued: 10,
    unindexable: 241,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    started_at: 1000,
    updated_at: 1000,
    complete: false,
    ...overrides,
  };
}

// ─── POST /api/fingerprints ───────────────────────────────────────────────────

describe("POST /api/fingerprints", () => {
  it("stores a fingerprint and echoes it without the payload", async () => {
    repo.upsertFingerprint.mockResolvedValue(storedRow());

    const res = await storeFingerprint(post(validUpsert()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ track_id: "t1", audio_sha256: "e".repeat(64) });
    // The blob is never echoed — it would double the response for no reason.
    expect(body).not.toHaveProperty("fingerprint_data");
  });

  it("decodes base64 payloads to a Buffer", async () => {
    repo.upsertFingerprint.mockResolvedValue(storedRow());

    await storeFingerprint(
      post(validUpsert({ fingerprint_data: Buffer.from([1, 2, 3]).toString("base64") }))
    );

    expect(repo.upsertFingerprint.mock.calls[0][0].fingerprint_data).toEqual(
      Buffer.from([1, 2, 3])
    );
  });

  it("stores a null payload as null, not an empty buffer", async () => {
    repo.upsertFingerprint.mockResolvedValue(storedRow());

    await storeFingerprint(post(validUpsert({ fingerprint_data: null })));

    expect(repo.upsertFingerprint.mock.calls[0][0].fingerprint_data).toBeNull();
  });

  it("defaults a missing duration to null", async () => {
    repo.upsertFingerprint.mockResolvedValue(storedRow());
    const body = validUpsert();
    delete (body as Record<string, unknown>).audio_duration_seconds;

    await storeFingerprint(post(body));

    expect(repo.upsertFingerprint.mock.calls[0][0].audio_duration_seconds).toBeNull();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await storeFingerprint(post(validUpsert({ audio_sha256: "nope" })));

    expect(res.status).toBe(400);
    expect(repo.upsertFingerprint).not.toHaveBeenCalled();
  });

  it("reports a vanished track as 409, not 500", async () => {
    // The track was deleted mid-run: the run's problem, not the server's.
    repo.upsertFingerprint.mockRejectedValue(
      new Error('insert violates foreign key constraint "track_fingerprints_track_fk"')
    );

    const res = await storeFingerprint(post(validUpsert()));

    expect(res.status).toBe(409);
  });

  it("reports anything else as 500", async () => {
    repo.upsertFingerprint.mockRejectedValue(new Error("connection reset"));

    const res = await storeFingerprint(post(validUpsert()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("connection reset");
  });

  it("handles a rejection that is not an Error", async () => {
    repo.upsertFingerprint.mockRejectedValue("driver exploded");

    const res = await storeFingerprint(post(validUpsert()));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("driver exploded");
  });

  it("falls back to a generic message when the error has none", async () => {
    repo.upsertFingerprint.mockRejectedValue(new Error(""));

    const res = await storeFingerprint(post(validUpsert()));

    expect((await res.json()).error).toBe("Failed to store fingerprint");
  });
});

// ─── POST /api/fingerprints/index ─────────────────────────────────────────────

describe("POST /api/fingerprints/index", () => {
  function indexPost(body: unknown): Request {
    return new Request("http://app/api/fingerprints/index", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("queues a run and returns 202 with the totals", async () => {
    service.startRun.mockResolvedValue(makeRun());

    const res = await startRun(indexPost({ scope: "missing" }));

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ run_id: "run-1", queued: 10, unindexable: 241 });
  });

  it("passes a track scope through", async () => {
    service.startRun.mockResolvedValue(makeRun({ scope: "track:t1" }));

    await startRun(indexPost({ scope: "track", track_id: "t1", friend_id: 2 }));

    expect(service.startRun).toHaveBeenCalledWith(
      { kind: "track", track_id: "t1", friend_id: 2 },
      { force: false }
    );
  });

  it("passes a release scope through", async () => {
    service.startRun.mockResolvedValue(makeRun({ scope: "release:r9" }));

    await startRun(indexPost({ scope: "release", release_id: "r9" }));

    expect(service.startRun).toHaveBeenCalledWith(
      { kind: "release", release_id: "r9", friend_id: undefined },
      { force: false }
    );
  });

  it("keeps force orthogonal to scope", async () => {
    // --all on its own still skips unchanged files; only --force rewrites them.
    service.startRun.mockResolvedValue(makeRun({ scope: "all" }));

    await startRun(indexPost({ scope: "all" }));
    expect(service.startRun).toHaveBeenCalledWith({ kind: "all" }, { force: false });

    await startRun(indexPost({ scope: "all", force: true }));
    expect(service.startRun).toHaveBeenLastCalledWith({ kind: "all" }, { force: true });
  });

  it("rejects an unknown scope with 400", async () => {
    const res = await startRun(indexPost({ scope: "everything" }));

    expect(res.status).toBe(400);
    expect(service.startRun).not.toHaveBeenCalled();
  });

  it("rejects a track scope with no id", async () => {
    const res = await startRun(indexPost({ scope: "track" }));

    expect(res.status).toBe(400);
  });

  it("answers 503 when no engine is registered", async () => {
    // Distinct from a 500: nothing is broken, the worker is simply not running,
    // and guessing an engine identity would poison the table.
    service.startRun.mockRejectedValue(new NoFingerprintEngineError());

    const res = await startRun(indexPost({ scope: "missing" }));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("fingerprint-service");
  });

  it("reports anything else as 500", async () => {
    service.startRun.mockRejectedValue(new Error("redis is gone"));

    const res = await startRun(indexPost({ scope: "missing" }));

    expect(res.status).toBe(500);
  });
});

// ─── GET /api/fingerprints/index/[runId] ──────────────────────────────────────

describe("GET /api/fingerprints/index/[runId]", () => {
  const request = new Request("http://app/api/fingerprints/index/run-1");

  it("returns the run's counters", async () => {
    service.getRun.mockResolvedValue(makeRun({ indexed: 7, complete: true }));

    const res = await getRun(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ indexed: 7, complete: true });
  });

  it("404s an unknown or expired run", async () => {
    // Counters carry a TTL, so "expired" and "never existed" are the same answer.
    service.getRun.mockResolvedValue(null);

    const res = await getRun(request, { params: Promise.resolve({ runId: "gone" }) });

    expect(res.status).toBe(404);
  });

  it("reports a lookup failure as 500", async () => {
    service.getRun.mockRejectedValue(new Error("redis is gone"));

    const res = await getRun(request, { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(500);
  });
});

// ─── GET /api/fingerprints ────────────────────────────────────────────────────

describe("GET /api/fingerprints", () => {
  function listRequest(query: string): Request {
    return new Request(`http://app/api/fingerprints?${query}`);
  }

  function indexRow(overrides: Record<string, unknown> = {}) {
    return {
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1.6.1",
      fingerprint_data: Buffer.from([1, 2, 3, 4]),
      audio_sha256: "e".repeat(64),
      audio_duration_seconds: 200,
      ...overrides,
    };
  }

  it("returns the stored fingerprints as base64", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([indexRow()]);

    const res = await listFingerprints(
      listRequest("fingerprint_type=chromaprint&fingerprint_version=1.6.1")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // JSON has no bytes; the matcher decodes this straight back to uint32s.
    expect(body.fingerprints[0].fingerprint_data).toBe(
      Buffer.from([1, 2, 3, 4]).toString("base64")
    );
  });

  it("passes a null blob through as null", async () => {
    // The stub engine stores null by design; the loader skips those.
    repo.listFingerprintsForIndex.mockResolvedValue([
      indexRow({ fingerprint_data: null }),
    ]);

    const res = await listFingerprints(
      listRequest("fingerprint_type=stub&fingerprint_version=0")
    );

    expect((await res.json()).fingerprints[0].fingerprint_data).toBeNull();
  });

  it("scopes to one engine and version", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=chromaprint&fingerprint_version=1.6.1")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint_type: "chromaprint",
        fingerprint_version: "1.6.1",
      })
    );
  });

  it("requires an engine and version", async () => {
    // Without them the matcher could be handed another engine's blobs, which
    // would decode to nonsense rather than fail loudly.
    const res = await listFingerprints(listRequest("fingerprint_type=chromaprint"));

    expect(res.status).toBe(400);
    expect(repo.listFingerprintsForIndex).not.toHaveBeenCalled();
  });

  it("pages, and caps the page size", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1&limit=99999&offset=40")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000, offset: 40 })
    );
  });

  it("falls back to sane paging for unparseable values", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1&limit=abc&offset=xyz")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500, offset: 0 })
    );
  });

  it("clamps a negative offset rather than passing it to SQL", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1&offset=-5")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 })
    );
  });

  it("ignores an unparseable friend_id rather than filtering on NaN", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1&friend_id=everyone")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({ friend_id: undefined })
    );
  });

  it("handles a rejection that is not an Error", async () => {
    // pg can reject with a plain object; String() it rather than reading
    // `.message` off something that has none.
    repo.listFingerprintsForIndex.mockRejectedValue("connection reset by peer");

    const res = await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1")
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("connection reset");
  });

  it("falls back to a generic message when the error has none", async () => {
    repo.listFingerprintsForIndex.mockRejectedValue(new Error(""));

    const res = await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1")
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to list fingerprints");
  });

  it("can narrow to one friend's library", async () => {
    repo.listFingerprintsForIndex.mockResolvedValue([]);

    await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1&friend_id=2")
    );

    expect(repo.listFingerprintsForIndex).toHaveBeenCalledWith(
      expect.objectContaining({ friend_id: 2 })
    );
  });

  it("reports a lookup failure as 500", async () => {
    repo.listFingerprintsForIndex.mockRejectedValue(new Error("connection reset"));

    const res = await listFingerprints(
      listRequest("fingerprint_type=c&fingerprint_version=1")
    );

    expect(res.status).toBe(500);
  });
});
