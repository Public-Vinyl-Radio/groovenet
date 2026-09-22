import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({ listRecent: vi.fn() }));
const debugSvc = vi.hoisted(() => ({ stats: vi.fn() }));
vi.mock("@/server/repositories/audioIngestRepository", () => ({
  audioIngestRepository: repo,
}));
vi.mock("@/server/services/ingestDebugService", () => ({
  ingestDebugService: debugSvc,
}));

import { GET as recent } from "../recent/route";
import { GET as stats } from "../stats/route";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1", source_id: "aswitch", session_id: "s1", sequence: "42",
    status: "processed", error: null, duration_seconds: 15.02,
    sample_rate: 44100, channels: 1, codec: "pcm_s16le",
    file_path: null, captured_at: "2026-09-21T02:00:00.000Z",
    received_at: "2026-09-21T02:00:02.000Z",
    updated_at: "2026-09-21T02:00:05.000Z",
    ...overrides,
  };
}

const req = (path: string, qs = "") => new Request(`http://app${path}?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  repo.listRecent.mockResolvedValue([row()]);
  debugSvc.stats.mockResolvedValue({
    since: "x", window_minutes: 60, source_id: null,
    index: { engine_registered: true, fingerprint_type: "chromaprint",
             fingerprint_version: "1", indexed_tracks: 3783, empty: false,
             missing_fingerprint_tracks: 0 },
    queue_depth: 0,
    ingests: { by_status: { processed: 10 }, failures: [], oldest_in_flight: null },
    detections: { windows: 10, matched: 8, no_match: 2, match_rate: 0.8,
                  confidence_bands: [] },
  });
});

describe("GET /api/audio/ingest/recent", () => {
  it("lists ingests", async () => {
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();

    expect(body.ingests[0]).toMatchObject({
      ingest_id: "i1", source_id: "aswitch", status: "processed", sequence: 42,
    });
  });

  it("coerces a bigint sequence to a number", async () => {
    // pg returns bigint as a string; JSON consumers expect a number.
    repo.listRecent.mockResolvedValue([row({ sequence: "9007199254740" })]);
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();
    expect(typeof body.ingests[0].sequence).toBe("number");
  });

  it("passes a null sequence through", async () => {
    repo.listRecent.mockResolvedValue([row({ sequence: null })]);
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();
    expect(body.ingests[0].sequence).toBeNull();
  });

  it("surfaces the failure reason", async () => {
    repo.listRecent.mockResolvedValue([
      row({ status: "failed", error: "decode failed" }),
    ]);
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();
    expect(body.ingests[0]).toMatchObject({ status: "failed", error: "decode failed" });
  });

  it("filters by status", async () => {
    await recent(req("/api/audio/ingest/recent", "status=failed"));
    expect(repo.listRecent.mock.calls[0][0].status).toBe("failed");
  });

  it("400s an unknown status rather than returning everything", async () => {
    const res = await recent(req("/api/audio/ingest/recent", "status=exploded"));

    expect(res.status).toBe(400);
    expect(repo.listRecent).not.toHaveBeenCalled();
  });

  it("caps the page size", async () => {
    await recent(req("/api/audio/ingest/recent", "limit=99999"));
    expect(repo.listRecent.mock.calls[0][0].limit).toBe(500);
  });

  it("falls back to sane paging for junk", async () => {
    await recent(req("/api/audio/ingest/recent", "limit=abc&offset=xyz"));
    expect(repo.listRecent.mock.calls[0][0]).toMatchObject({ limit: 50, offset: 0 });
  });

  it("clamps a negative offset", async () => {
    await recent(req("/api/audio/ingest/recent", "offset=-5"));
    expect(repo.listRecent.mock.calls[0][0].offset).toBe(0);
  });

  it("filters by source and session", async () => {
    await recent(req("/api/audio/ingest/recent", "source_id=aswitch&session_id=s1"));
    expect(repo.listRecent.mock.calls[0][0]).toMatchObject({
      source_id: "aswitch", session_id: "s1",
    });
  });

  it("tolerates a chunk the device sent no capture time for", async () => {
    // captured_at is optional on upload (#275).
    repo.listRecent.mockResolvedValue([row({ captured_at: null })]);
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();
    expect(body.ingests[0].captured_at).toBeNull();
  });

  it("500s a query failure", async () => {
    repo.listRecent.mockRejectedValue(new Error("connection reset"));
    expect((await recent(req("/api/audio/ingest/recent"))).status).toBe(500);
  });

  it("500s a rejection that is not an Error", async () => {
    repo.listRecent.mockRejectedValue("boom");
    expect((await recent(req("/api/audio/ingest/recent"))).status).toBe(500);
  });

  it("falls back to a generic message", async () => {
    repo.listRecent.mockRejectedValue(new Error(""));
    const body = await (await recent(req("/api/audio/ingest/recent"))).json();
    expect(body.error).toBe("Failed to list ingests");
  });
});

describe("GET /api/audio/ingest/stats", () => {
  it("returns the pipeline summary", async () => {
    const body = await (await stats(req("/api/audio/ingest/stats"))).json();
    expect(body.index).toMatchObject({ indexed_tracks: 3783, empty: false });
  });

  it("defaults to a one hour window", async () => {
    await stats(req("/api/audio/ingest/stats"));
    expect(debugSvc.stats).toHaveBeenCalledWith(60, undefined);
  });

  it("accepts a custom window and source", async () => {
    await stats(req("/api/audio/ingest/stats", "minutes=15&source_id=aswitch"));
    expect(debugSvc.stats).toHaveBeenCalledWith(15, "aswitch");
  });

  it("clamps an absurd window rather than scanning forever", async () => {
    await stats(req("/api/audio/ingest/stats", "minutes=99999999"));
    expect(debugSvc.stats).toHaveBeenCalledWith(60 * 24 * 7, undefined);
  });

  it("falls back to the default for a junk window", async () => {
    await stats(req("/api/audio/ingest/stats", "minutes=soon"));
    expect(debugSvc.stats).toHaveBeenCalledWith(60, undefined);
  });

  it("500s a failure", async () => {
    debugSvc.stats.mockRejectedValue(new Error("redis is gone"));
    expect((await stats(req("/api/audio/ingest/stats"))).status).toBe(500);
  });

  it("500s a rejection that is not an Error", async () => {
    debugSvc.stats.mockRejectedValue("boom");
    expect((await stats(req("/api/audio/ingest/stats"))).status).toBe(500);
  });

  it("falls back to a generic message", async () => {
    debugSvc.stats.mockRejectedValue(new Error(""));
    const body = await (await stats(req("/api/audio/ingest/stats"))).json();
    expect(body.error).toBe("Failed to build stats");
  });
});
