/**
 * POST /api/audio/ingest (#275).
 *
 * The route is deliberately thin, so these are about the HTTP contract the
 * listener device codes against: status codes and the stable `error`
 * vocabulary it uses to decide whether to retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const service = vi.hoisted(() => ({ accept: vi.fn() }));
vi.mock("@/server/services/audioIngestService", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/server/services/audioIngestService")
  >();
  return { ...actual, audioIngestService: service };
});

import { POST } from "../route";
import { IngestRejected } from "@/server/services/audioIngestService";

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
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  service.accept.mockResolvedValue(accepted);
});

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
});
