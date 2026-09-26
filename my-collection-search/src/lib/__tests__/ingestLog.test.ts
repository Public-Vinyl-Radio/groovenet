/**
 * The structured ingest logger (#280): what may reach a log line, and how.
 * `fingerprint_service/observability.py` is held to the same rules.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  INGEST_LOG_COMPONENT,
  MAX_STRING,
  errorMessage,
  logIngestEvent,
  msSince,
  redact,
  sanitize,
} from "../ingestLog";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("sanitize", () => {
  it("drops fields that are not on the allowlist", () => {
    expect(
      sanitize({ ingest_id: "a", file_path: "x.wav", headers: "Bearer x", body: "{}" })
    ).toEqual({ ingest_id: "a" });
  });

  it.each([
    ["a Buffer", Buffer.from("RIFF")],
    ["a Uint8Array", new Uint8Array([1, 2, 3])],
    ["a File", new File([new Uint8Array(8)], "chunk.wav")],
    ["an object", { nested: "value" }],
    ["an array", ["a"]],
  ])("never keeps %s, even under an allowed name", (_label, value) => {
    expect(sanitize({ error: value })).toEqual({});
  });

  it("keeps scalars and explicit nulls, and skips undefined", () => {
    expect(
      sanitize({ sequence: 7, confidence: 0.9, track_id: null, duplicate: true, codec: undefined })
    ).toEqual({ sequence: 7, confidence: 0.9, track_id: null, duplicate: true });
  });

  it("drops numbers JSON cannot carry", () => {
    expect(sanitize({ level_dbfs: -Infinity, confidence: NaN })).toEqual({});
  });
});

describe("redact", () => {
  it.each([
    ["Authorization: Bearer abc.def.ghi", "abc.def.ghi"],
    ["GET /x?token=s3cret&y=1", "s3cret"],
    ["password=hunter2", "hunter2"],
    ["api_key: k-123", "k-123"],
    ["redis://default:pa55@redis:6379", "pa55"],
    ["postgres://djplaylist:pw@db:5432/djplaylist", "pw"],
  ])("scrubs %s", (text, secret) => {
    expect(redact(text)).not.toContain(secret);
    expect(redact(text)).toContain("[redacted]");
  });

  it("leaves ordinary text alone", () => {
    const text = "ffprobe found no audio stream in chunk";
    expect(redact(text)).toBe(text);
  });

  it("caps the length", () => {
    expect(redact("x".repeat(10_000))).toHaveLength(MAX_STRING);
  });
});

describe("logIngestEvent", () => {
  it("writes one parseable JSON line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logIngestEvent("ingest.accepted", { ingest_id: "a", sequence: 3 });

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(log.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      level: "info",
      component: INGEST_LOG_COMPONENT,
      event: "ingest.accepted",
      ingest_id: "a",
      sequence: 3,
    });
    expect(new Date(line.ts).toISOString()).toBe(line.ts);
  });

  it("routes by level", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logIngestEvent("ingest.rejected", {}, "warn");
    logIngestEvent("ingest.failed", {}, "error");
    expect(JSON.parse(warn.mock.calls[0][0] as string).level).toBe("warn");
    expect(JSON.parse(error.mock.calls[0][0] as string).level).toBe("error");
  });

  it("will not write what a careless caller passes", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logIngestEvent("ingest.accepted", {
      ingest_id: "a",
      // Not in IngestLogFields; a JS caller could still pass it.
      ...({ audio: Buffer.from("AUDIOBYTES"), authorization: "Bearer t0k" } as object),
    });
    const text = log.mock.calls[0][0] as string;
    expect(text).not.toContain("AUDIOBYTES");
    expect(text).not.toContain("t0k");
  });
});

describe("helpers", () => {
  it("takes only an error's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });

  it("measures from a timestamp, and never negative", () => {
    const now = Date.parse("2026-09-20T18:42:25Z");
    expect(msSince("2026-09-20T18:42:10Z", now)).toBe(15_000);
    expect(msSince(new Date(now + 5_000), now)).toBe(0);
    expect(msSince(null, now)).toBeNull();
    expect(msSince("not a date", now)).toBeNull();
  });
});
