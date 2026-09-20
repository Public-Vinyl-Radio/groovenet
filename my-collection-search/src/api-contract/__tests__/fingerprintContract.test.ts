/**
 * The cross-language wire contract for reference fingerprinting (#277).
 *
 * `fingerprint-service` builds these bodies in Python and this app validates
 * them with Zod, so nothing but a test can catch the two drifting apart. Each
 * payload here is exactly what `indexer.build_upsert` emits or what the CLI
 * sends — change one side and this fails rather than a run failing in
 * production on every single track.
 */
import { describe, it, expect } from "vitest";
import {
  fingerprintUpsertBodySchema,
  fingerprintIndexBodySchema,
} from "@/api-contract/schemas";

// Exactly what fingerprint_service.indexer.build_upsert emits.
describe("upsert body accepts what the worker posts", () => {
  it("accepts a stub payload (no fingerprint data)", () => {
    const parsed = fingerprintUpsertBodySchema.safeParse({
      track_id: "1234-5",
      friend_id: 1,
      fingerprint_type: "stub",
      fingerprint_version: "0",
      fingerprint_data: null,
      audio_sha256: "e".repeat(64),
      audio_duration_seconds: 212.5,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("accepts a real base64 payload", () => {
    const parsed = fingerprintUpsertBodySchema.safeParse({
      track_id: "1234-5",
      friend_id: 1,
      fingerprint_type: "chromaprint",
      fingerprint_version: "1",
      fingerprint_data: Buffer.from([0, 1, 2, 250]).toString("base64"),
      audio_sha256: "a1b2c3d4".repeat(8),
      audio_duration_seconds: 212.5,
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("rejects an uppercase or truncated hash", () => {
    expect(
      fingerprintUpsertBodySchema.safeParse({
        track_id: "t", friend_id: 1, fingerprint_type: "s",
        fingerprint_version: "0", audio_sha256: "E".repeat(64),
      }).success
    ).toBe(false);
  });
});

describe("index body accepts what the CLI sends", () => {
  it.each([
    { scope: "missing" },
    { scope: "changed" },
    { scope: "all", force: true },
    { scope: "track", track_id: "1234-5" },
    { scope: "release", release_id: "12345", friend_id: 2 },
  ])("accepts %o", (body) => {
    const parsed = fingerprintIndexBodySchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("rejects scope track with no id", () => {
    expect(fingerprintIndexBodySchema.safeParse({ scope: "track" }).success).toBe(false);
  });

  it("rejects scope release with no id", () => {
    expect(fingerprintIndexBodySchema.safeParse({ scope: "release" }).success).toBe(false);
  });
});
