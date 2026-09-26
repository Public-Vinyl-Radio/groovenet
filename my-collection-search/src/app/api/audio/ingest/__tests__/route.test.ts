/**
 * POST /api/audio/ingest (#275).
 *
 * The route is deliberately thin, so these are about the HTTP contract the
 * listener device codes against: status codes and the stable `error`
 * vocabulary it uses to decide whether to retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const service = vi.hoisted(() => ({ accept: vi.fn() }));
const metrics = vi.hoisted(() => ({
  chunkReceived: vi.fn(),
  chunkRejected: vi.fn(),
  chunkFailed: vi.fn(),
}));
vi.mock("@/server/services/ingestMetricsService", () => ({
  ingestMetricsService: metrics,
}));
vi.mock("@/server/services/audioIngestService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/services/audioIngestService")
  >();
  return { ...actual, audioIngestService: service };
});

import { POST } from "../route";
import { IngestFailure, IngestRejected } from "@/server/services/audioIngestService";

const accepted = {
  status: "accepted" as const,
  ingest_id: "11111111-1111-1111-1111-111111111111",
  source_id: "living-room-vinyl",
  duration_seconds: 15.02,
  sample_rate: 44100,
  channels: 1,
  captured_at: "2026-09-20T18:42:10.000Z",
};

function request(parts: Record<string, string | File | undefined>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(parts)) {
    if (value !== undefined) form.append(key, value);
  }
  return new Request("http://app/api/audio/ingest", { method: "POST", body: form });
}

function audioFile(name = "chunk.wav", bytes = 2048): File {
  return new File([new Uint8Array(bytes)], name, { type: "audio/wav" });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.accept.mockResolvedValue(accepted);
});

/** Every structured line written so far, parsed; free-text lines are skipped. */
function logged(): Array<Record<string, unknown>> {
  const calls = [
    ...vi.mocked(console.error).mock.calls,
    ...(vi.isMockFunction(console.warn) ? vi.mocked(console.warn).mock.calls : []),
    ...(vi.isMockFunction(console.log) ? vi.mocked(console.log).mock.calls : []),
  ];
  return calls
    .map(([first]) => {
      try {
        return typeof first === "string" ? JSON.parse(first) : null;
      } catch {
        return null;
      }
    })
    .filter((line): line is Record<string, unknown> => line?.component === "audio-ingest");
}

/** Everything written to the console, as one string, for leak checks. */
function consoleText(): string {
  return [console.error, console.warn, console.log]
    .filter((fn) => vi.isMockFunction(fn))
    .flatMap((fn) => vi.mocked(fn).mock.calls)
    .map((args) => args.map((a) => (typeof a === "string" ? a : String(a))).join(" "))
    .join("\n");
}

describe("POST /api/audio/ingest", () => {
  it("accepts a chunk with 202", async () => {
    const res = await POST(
      request({ audio: audioFile(), source_id: "living-room-vinyl" })
    );

    // 202, not 200: what this audio *is* will not be known for a second or two.
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(accepted);
  });

  it("passes the optional fields through", async () => {
    await POST(
      request({
        audio: audioFile(),
        source_id: "living-room-vinyl",
        session_id: "sess-1",
        sequence: "42",
        captured_at: "2026-09-20T18:42:10.000Z",
      })
    );

    expect(service.accept.mock.calls[0][1]).toEqual({
      source_id: "living-room-vinyl",
      session_id: "sess-1",
      sequence: 42,
      captured_at: "2026-09-20T18:42:10.000Z",
    });
  });

  it("treats absent optional fields as null", async () => {
    await POST(request({ audio: audioFile(), source_id: "s" }));

    expect(service.accept.mock.calls[0][1]).toEqual({
      source_id: "s",
      session_id: null,
      sequence: null,
      captured_at: null,
    });
  });

  it("ignores an unparseable sequence rather than failing", async () => {
    // A garbled field should not cost the chunk; it only disables dedupe.
    await POST(request({ audio: audioFile(), source_id: "s", sequence: "abc" }));

    expect(service.accept.mock.calls[0][1].sequence).toBeNull();
  });

  // ── the rejection vocabulary ──

  it("400s a request with no audio part", async () => {
    const res = await POST(request({ source_id: "s" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_audio_file");
    expect(service.accept).not.toHaveBeenCalled();
  });

  it("400s an empty audio part", async () => {
    const res = await POST(
      request({ audio: new File([], "chunk.wav"), source_id: "s" })
    );

    expect((await res.json()).error).toBe("missing_audio_file");
  });

  it("400s a body that is not multipart", async () => {
    const res = await POST(
      new Request("http://app/api/audio/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: "s" }),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_audio_file");
  });

  it("400s a missing source_id", async () => {
    const res = await POST(request({ audio: audioFile() }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_source_id");
  });

  it("400s a blank source_id", async () => {
    const res = await POST(request({ audio: audioFile(), source_id: "   " }));

    expect((await res.json()).error).toBe("missing_source_id");
  });

  it.each([
    ["unsupported_audio_format", 400],
    ["invalid_audio_stream", 400],
    ["audio_too_short", 400],
    ["audio_too_long", 400],
  ] as const)("surfaces %s as %i", async (code, status) => {
    service.accept.mockRejectedValue(new IngestRejected(code, "nope"));

    const res = await POST(request({ audio: audioFile(), source_id: "s" }));

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code, message: "nope" });
  });

  it("413s an oversized upload", async () => {
    // Distinct from the other rejections: the device should back off its chunk
    // size, not conclude the audio was bad.
    service.accept.mockRejectedValue(
      new IngestRejected("audio_too_large", "too big")
    );

    const res = await POST(request({ audio: audioFile(), source_id: "s" }));

    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("audio_too_large");
  });

  it("500s an unexpected failure with a distinguishable code", async () => {
    // The device retries on internal_error and gives up on the others.
    service.accept.mockRejectedValue(new Error("disk is full"));

    const res = await POST(request({ audio: audioFile(), source_id: "s" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("internal_error");
  });

  it("500s a rejection that is not an Error", async () => {
    service.accept.mockRejectedValue("driver exploded");

    const res = await POST(request({ audio: audioFile(), source_id: "s" }));

    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("driver exploded");
  });

  it("falls back to a generic message when the error has none", async () => {
    service.accept.mockRejectedValue(new Error(""));

    const res = await POST(request({ audio: audioFile(), source_id: "s" }));

    expect((await res.json()).message).toBe("Failed to accept audio");
  });

  // ── what the pipeline leaves behind (#280) ──

  describe("observability", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("counts every upload that reaches the route", async () => {
      await POST(request({ audio: audioFile(), source_id: "s" }));
      await POST(request({ source_id: "s" }));
      expect(metrics.chunkReceived).toHaveBeenCalledTimes(2);
    });

    it("logs and counts a rejection by reason and stage", async () => {
      service.accept.mockRejectedValue(new IngestRejected("audio_too_short", "2.00s is under"));

      await POST(
        request({
          audio: audioFile("chunk.wav", 4096),
          source_id: "living-room-vinyl",
          session_id: "sess-1",
          sequence: "42",
        })
      );

      expect(metrics.chunkRejected).toHaveBeenCalledWith("audio_too_short");
      const [line] = logged();
      expect(line).toMatchObject({
        event: "ingest.rejected",
        level: "warn",
        stage: "validation",
        reason: "audio_too_short",
        source_id: "living-room-vinyl",
        session_id: "sess-1",
        sequence: 42,
        size_bytes: 4096,
      });
      expect(typeof line.processing_ms).toBe("number");
    });

    it.each([
      ["missing_audio_file", { source_id: "s" }, "upload"],
      ["missing_source_id", { audio: audioFile() }, "upload"],
    ] as const)("names the upload stage for %s", async (reason, parts, stage) => {
      await POST(request(parts));
      expect(logged()[0]).toMatchObject({ reason, stage });
    });

    it("names the upload stage for an oversized chunk", async () => {
      service.accept.mockRejectedValue(new IngestRejected("audio_too_large", "too big"));
      await POST(request({ audio: audioFile(), source_id: "s" }));
      expect(logged()[0]).toMatchObject({ reason: "audio_too_large", stage: "upload" });
    });

    it("names the stage the app itself failed at", async () => {
      service.accept.mockRejectedValue(new IngestFailure("store", new Error("disk is full")));

      const res = await POST(request({ audio: audioFile(), source_id: "s" }));

      expect(res.status).toBe(500);
      expect(await res.json()).toMatchObject({ error: "internal_error", message: "disk is full" });
      expect(metrics.chunkFailed).toHaveBeenCalledWith("store");
      expect(logged()[0]).toMatchObject({
        event: "ingest.error",
        level: "error",
        stage: "store",
        error: "disk is full",
      });
    });

    it("never logs the audio, the request's credentials, or its form", async () => {
      service.accept.mockRejectedValue(new IngestRejected("invalid_audio_stream", "no audio stream"));
      const form = new FormData();
      form.append("audio", new File([new TextEncoder().encode("AUDIOBYTES".repeat(500))], "chunk.wav"));
      form.append("source_id", "s");
      form.append("device_token", "form-secret-123");

      await POST(
        new Request("http://app/api/audio/ingest?token=query-secret-456", {
          method: "POST",
          headers: { Authorization: "Bearer header-secret-789", Cookie: "session=cookie-secret" },
          body: form,
        })
      );
      service.accept.mockRejectedValue(new Error("boom"));
      await POST(
        new Request("http://app/api/audio/ingest", {
          method: "POST",
          headers: { Authorization: "Bearer header-secret-789" },
          body: form,
        })
      );

      expect(logged()).toHaveLength(2);
      const text = consoleText();
      for (const secret of [
        "AUDIOBYTES",
        "form-secret-123",
        "query-secret-456",
        "header-secret-789",
        "cookie-secret",
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });
});
