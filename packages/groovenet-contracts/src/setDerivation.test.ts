import { describe, expect, it } from "vitest";
import {
  SET_DERIVATION_STATUSES,
  setDerivationCreateBodyObjectSchema,
  setDerivationJsonSchemas,
  setDerivationResultBodyObjectSchema,
  setDerivationViewSchema,
} from "./setDerivation.js";

const derivation = {
  id: "7c1c2c0e-1111-4222-8333-444455556666",
  recording_sha256: "a".repeat(64),
  fingerprint_type: "chromaprint",
  fingerprint_version: "1",
  window_seconds: 15,
  step_seconds: 15,
  status: "processed",
  error: null,
  duration_seconds: 30,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:01:00.000Z",
  completed_at: "2026-01-01T00:01:00.000Z",
};
const recording = {
  sha256: "a".repeat(64),
  file_path: "a.flac",
  original_filename: null,
  format_name: "flac",
  duration_seconds: 30,
  size_bytes: "1234",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("set derivation contracts", () => {
  it("lists the run statuses", () => {
    expect(SET_DERIVATION_STATUSES).toEqual(["queued", "processing", "processed", "failed"]);
  });

  it("validates the create body", () => {
    const schema = setDerivationCreateBodyObjectSchema;
    expect(schema.safeParse({ recording_sha256: "a".repeat(64) }).success).toBe(true);
    expect(schema.safeParse({ recording_sha256: "A".repeat(64) }).success).toBe(false);
    expect(schema.safeParse({ recording_sha256: "a".repeat(64), window_seconds: 0 }).success).toBe(
      false,
    );
    expect(setDerivationJsonSchemas.SetDerivationRequest.required).toEqual(["recording_sha256"]);
  });

  it("defaults windows and candidates in a result body", () => {
    expect(setDerivationResultBodyObjectSchema.parse({ status: "failed" }).windows).toEqual([]);
    const parsed = setDerivationResultBodyObjectSchema.parse({
      status: "processed",
      windows: [{ start_seconds: 0, duration_seconds: 15 }],
    });
    expect(parsed.windows[0].candidates).toEqual([]);
  });

  it("parses a view with and without a diff", () => {
    const view = {
      derivation,
      recording,
      summary: null,
      tracklist: [
        {
          track_id: "t1",
          friend_id: 1,
          start_seconds: 0,
          end_seconds: 15,
          confidence: 0.9,
          windows: 1,
          rate: null,
          track: null,
        },
      ],
      unidentified: [{ start_seconds: 15, end_seconds: 30, unindexed_neighbours: [] }],
      diff: null,
    };
    expect(setDerivationViewSchema.safeParse(view).success).toBe(true);
    const planned = {
      track_id: "t1",
      friend_id: 1,
      title: null,
      artist: null,
      release_id: null,
      position: null,
      index: 0,
      fingerprinted: true,
    };
    expect(
      setDerivationViewSchema.safeParse({
        ...view,
        diff: {
          playlist_id: 1,
          played_as_planned: [{ play: 0, planned, out_of_order: false }],
          played_instead_of: [],
          played_not_planned: [],
          planned_not_played: [planned],
        },
      }).success,
    ).toBe(true);
    expect(setDerivationViewSchema.safeParse({ ...view, tracklist: "x" }).success).toBe(false);
  });

  it("accepts the result fingerprint-set-worker posts", () => {
    // Shaped like fingerprint_service/results.py `build_set_result`.
    const body = {
      derivation_id: derivation.id,
      status: "processed",
      error: null,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      sample_rate: 11025,
      duration_seconds: 30,
      window_seconds: 15,
      step_seconds: 15,
      windows: [
        {
          start_seconds: 0,
          duration_seconds: 15,
          candidates: [{ track_id: "t1", friend_id: 1, confidence: 0.9, offset_seconds: 3 }],
        },
        { start_seconds: 15, duration_seconds: 15, candidates: [] },
      ],
    };
    expect(setDerivationResultBodyObjectSchema.parse(body)).toEqual(body);
  });
});
