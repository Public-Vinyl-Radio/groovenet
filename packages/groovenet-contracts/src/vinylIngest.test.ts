import { describe, expect, it } from "vitest";
import {
  FINGERPRINT_INDEX_SCOPES,
  INGEST_ERROR_CODES,
  fingerprintFileStatsBodyObjectSchema,
  fingerprintIndexBodyObjectSchema,
  fingerprintUpsertBodyObjectSchema,
  ingestPipelineStatsSchema,
  ingestResultBodyObjectSchema,
  refineFingerprintIndexBody,
  vinylIngestJsonSchemas,
} from "./vinylIngest.js";

const sha = "a".repeat(64);

describe("vinyl ingest contracts", () => {
  it("keeps the listener rejection vocabulary stable", () => {
    expect(INGEST_ERROR_CODES).toEqual([
      "missing_audio_file",
      "missing_source_id",
      "unsupported_audio_format",
      "invalid_audio_stream",
      "audio_too_large",
      "audio_too_short",
      "audio_too_long",
      "internal_error",
    ]);
    expect(vinylIngestJsonSchemas.IngestError.properties.error.enum).toEqual([
      ...INGEST_ERROR_CODES,
    ]);
  });

  it("defaults candidates and strips unknown keys in a result body", () => {
    const parsed = ingestResultBodyObjectSchema.parse({ status: "processed", future: 1 });
    expect(parsed).toEqual({ status: "processed", candidates: [] });
    expect(ingestResultBodyObjectSchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("publishes the result body input shape with candidates optional", () => {
    const schema = vinylIngestJsonSchemas.IngestResultBody;
    expect(schema.required).toEqual(["status"]);
  });

  it("validates fingerprint bodies", () => {
    const body = {
      track_id: "t1",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      audio_sha256: sha,
    };
    expect(fingerprintUpsertBodyObjectSchema.safeParse(body).success).toBe(true);
    expect(
      fingerprintUpsertBodyObjectSchema.safeParse({ ...body, fingerprint_data: "AAEC" }).success,
    ).toBe(true);
    expect(
      fingerprintUpsertBodyObjectSchema.safeParse({ ...body, fingerprint_data: "not base64!" })
        .success,
    ).toBe(false);
    expect(
      fingerprintUpsertBodyObjectSchema.safeParse({ ...body, audio_sha256: "xyz" }).success,
    ).toBe(false);
    expect(
      fingerprintFileStatsBodyObjectSchema.safeParse({
        ...body,
        audio_size_bytes: 10,
        audio_mtime_ms: 20,
      }).success,
    ).toBe(true);
    expect(fingerprintFileStatsBodyObjectSchema.safeParse(body).success).toBe(false);
  });

  it("requires an id for the track and release index scopes", () => {
    const schema = fingerprintIndexBodyObjectSchema.superRefine(refineFingerprintIndexBody);
    expect(FINGERPRINT_INDEX_SCOPES).toContain("release");
    expect(schema.safeParse({ scope: "all" }).success).toBe(true);
    expect(schema.safeParse({ scope: "track" }).success).toBe(false);
    expect(schema.safeParse({ scope: "track", track_id: "t" }).success).toBe(true);
    expect(schema.safeParse({ scope: "release" }).success).toBe(false);
    expect(schema.safeParse({ scope: "release", release_id: "r" }).success).toBe(true);
    expect(schema.safeParse({ scope: "everything" }).success).toBe(false);
  });

  it("accepts pipeline stats from an app older than the counters", () => {
    const stats = {
      since: "2026-01-01T00:00:00Z",
      window_minutes: 60,
      source_id: null,
      ingest_writable: true,
      index: {
        engine_registered: true,
        fingerprint_type: "chromaprint",
        fingerprint_version: "1",
        indexed_tracks: 3,
        empty: false,
        missing_fingerprint_tracks: 0,
      },
      queue_depth: null,
      ingests: { by_status: { processed: 2 }, failures: [], oldest_in_flight: null },
      detections: { windows: 2, matched: 1, no_match: 1, match_rate: 0.5, confidence_bands: [] },
      spins: { pending: null },
    };
    expect(ingestPipelineStatsSchema.safeParse(stats).success).toBe(true);
    expect(ingestPipelineStatsSchema.safeParse({ ...stats, counters: null }).success).toBe(true);
  });

  it("accepts the payloads fingerprint-service posts, field for field", () => {
    // Shaped like fingerprint_service/results.py and indexer.py.
    const failed = {
      ingest_id: "i1",
      source_id: "pi",
      session_id: null,
      sequence: null,
      status: "failed",
      error: "decode failed",
      error_stage: "decode",
      window_start_at: null,
      duration_seconds: null,
      sample_rate: null,
      level_dbfs: null,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      candidates: [],
    };
    expect(ingestResultBodyObjectSchema.parse(failed)).toEqual(failed);
    const matched = {
      ...failed,
      status: "processed",
      error: null,
      error_stage: null,
      window_start_at: "2026-01-01T00:00:00Z",
      candidates: [{ track_id: "t1", friend_id: 1, confidence: 0.9, offset_seconds: 12.5 }],
    };
    expect(ingestResultBodyObjectSchema.parse(matched).candidates).toHaveLength(1);
    expect(
      fingerprintUpsertBodyObjectSchema.safeParse({
        track_id: "t1",
        friend_id: 1,
        fingerprint_type: "chromaprint",
        fingerprint_version: "1",
        fingerprint_data: null,
        audio_sha256: sha,
        audio_duration_seconds: 215.4,
        audio_size_bytes: 1024,
        audio_mtime_ms: 1767225600000,
      }).success,
    ).toBe(true);
  });
});
