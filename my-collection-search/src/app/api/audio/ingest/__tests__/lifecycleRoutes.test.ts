/**
 * The callback routes fingerprint-service posts to (#276).
 *
 * Thin over `ingestLifecycleService`, so these are about the HTTP contract the
 * worker codes against — including the 404 that tells it an ingest is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const lifecycle = vi.hoisted(() => ({ claim: vi.fn(), report: vi.fn() }));
vi.mock("@/server/services/ingestLifecycleService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/services/ingestLifecycleService")
  >();
  return { ...actual, ingestLifecycleService: lifecycle };
});

import { POST as claim } from "../[ingestId]/claim/route";
import { POST as result } from "../[ingestId]/result/route";
import { IngestNotFound } from "@/server/services/ingestLifecycleService";

const params = (ingestId = "ingest-1") => ({ params: Promise.resolve({ ingestId }) });

function resultRequest(body: unknown): Request {
  return new Request("http://app/api/audio/ingest/ingest-1/result", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    ingest_id: "ingest-1",
    source_id: "living-room-vinyl",
    session_id: "sess-1",
    sequence: 42,
    status: "processed",
    error: null,
    window_start_at: "2026-09-20T18:42:10.000Z",
    duration_seconds: 15.02,
    sample_rate: 22050,
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    candidates: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  lifecycle.claim.mockResolvedValue({ id: "ingest-1", status: "processing" });
  lifecycle.report.mockResolvedValue({ id: "ingest-1", status: "processed" });
});

describe("POST /api/audio/ingest/[id]/claim", () => {
  it("reports the claimed status", async () => {
    const res = await claim(new Request("http://app/x", { method: "POST" }), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingest_id: "ingest-1", status: "processing" });
  });

  it("404s an unknown ingest", async () => {
    lifecycle.claim.mockRejectedValue(new IngestNotFound("nope"));

    const res = await claim(new Request("http://app/x", { method: "POST" }), params("nope"));

    expect(res.status).toBe(404);
  });

  it("500s an unexpected failure", async () => {
    lifecycle.claim.mockRejectedValue(new Error("database is down"));

    const res = await claim(new Request("http://app/x", { method: "POST" }), params());

    expect(res.status).toBe(500);
  });

  it("500s a rejection that is not an Error", async () => {
    lifecycle.claim.mockRejectedValue("driver exploded");

    const res = await claim(new Request("http://app/x", { method: "POST" }), params());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("driver exploded");
  });

  it("falls back to a generic message when the error has none", async () => {
    lifecycle.claim.mockRejectedValue(new Error(""));

    const res = await claim(new Request("http://app/x", { method: "POST" }), params());

    expect((await res.json()).error).toBe("Failed to claim ingest");
  });
});

describe("POST /api/audio/ingest/[id]/result", () => {
  it("accepts the worker's report", async () => {
    const res = await result(resultRequest(validReport()), params());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ingest_id: "ingest-1",
      status: "processed",
      detections: 0,
    });
  });

  it("counts the detections it recorded", async () => {
    const res = await result(
      resultRequest(
        validReport({
          candidates: [
            { track_id: "t1", friend_id: 1, confidence: 0.94, offset_seconds: 12.4 },
          ],
        })
      ),
      params()
    );

    expect((await res.json()).detections).toBe(1);
  });

  it("accepts a failed chunk with its error", async () => {
    lifecycle.report.mockResolvedValue({ id: "ingest-1", status: "failed" });

    const res = await result(
      resultRequest(validReport({ status: "failed", error: "decode failed" })),
      params()
    );

    expect(res.status).toBe(200);
    expect(lifecycle.report.mock.calls[0][0]).toMatchObject({
      status: "failed",
      error: "decode failed",
    });
  });

  it("takes the ingest id from the path, not the body", async () => {
    // A body naming a different ingest is a bug worth ignoring rather than
    // honouring — otherwise one worker could close out another's chunk.
    await result(
      resultRequest(validReport({ ingest_id: "someone-elses-ingest" })),
      params("ingest-1")
    );

    expect(lifecycle.report.mock.calls[0][0].ingest_id).toBe("ingest-1");
  });

  it("defaults absent candidates to an empty list", async () => {
    const body = validReport();
    delete (body as Record<string, unknown>).candidates;

    const res = await result(resultRequest(body), params());

    expect(res.status).toBe(200);
    expect(lifecycle.report.mock.calls[0][0].candidates).toEqual([]);
  });

  it("400s a body with no status", async () => {
    const body = validReport();
    delete (body as Record<string, unknown>).status;

    const res = await result(resultRequest(body), params());

    expect(res.status).toBe(400);
    expect(lifecycle.report).not.toHaveBeenCalled();
  });

  it("400s an unknown status", async () => {
    // `received` and `processing` are not things the worker gets to report.
    const res = await result(resultRequest(validReport({ status: "processing" })), params());

    expect(res.status).toBe(400);
  });

  it("400s a malformed candidate", async () => {
    const res = await result(
      resultRequest(validReport({ candidates: [{ track_id: "t1" }] })),
      params()
    );

    expect(res.status).toBe(400);
  });

  it("404s a result for an unknown ingest", async () => {
    lifecycle.report.mockRejectedValue(new IngestNotFound("nope"));

    const res = await result(resultRequest(validReport()), params("nope"));

    expect(res.status).toBe(404);
  });

  it("500s an unexpected failure", async () => {
    lifecycle.report.mockRejectedValue(new Error("database is down"));

    const res = await result(resultRequest(validReport()), params());

    expect(res.status).toBe(500);
  });

  it("500s a rejection that is not an Error", async () => {
    lifecycle.report.mockRejectedValue("driver exploded");

    const res = await result(resultRequest(validReport()), params());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("driver exploded");
  });

  it("falls back to a generic message when the error has none", async () => {
    lifecycle.report.mockRejectedValue(new Error(""));

    const res = await result(resultRequest(validReport()), params());

    expect((await res.json()).error).toBe("Failed to record result");
  });
});
