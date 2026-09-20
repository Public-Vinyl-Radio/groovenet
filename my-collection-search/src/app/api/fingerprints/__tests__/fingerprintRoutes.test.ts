/**
 * The three fingerprint routes (#277).
 *
 * These are the seam `fingerprint-service` posts into and the CLI polls, so the
 * status codes matter as much as the bodies: a 503 tells the CLI the worker is
 * down rather than that indexing failed, and a 409 tells it a track vanished
 * mid-run rather than that the app broke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({ upsertFingerprint: vi.fn() }));
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

import { POST as storeFingerprint } from "../route";
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
