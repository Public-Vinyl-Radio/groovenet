import { describe, it, expect } from "vitest";
import {
  generateLocalReleaseId,
  generateLocalTrackId,
  isLocalTrack,
  isLocalAlbum,
} from "../localTrackHelpers";

// ─── generateLocalReleaseId ───────────────────────────────────────────────────

describe("generateLocalReleaseId", () => {
  it("starts with 'local-'", () => {
    expect(generateLocalReleaseId()).toMatch(/^local-/);
  });

  it("contains a UUID v4 after the prefix", () => {
    const id = generateLocalReleaseId();
    const uuid = id.slice("local-".length);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates a unique id on each call", () => {
    expect(generateLocalReleaseId()).not.toBe(generateLocalReleaseId());
  });
});

// ─── generateLocalTrackId ─────────────────────────────────────────────────────

describe("generateLocalTrackId", () => {
  it("starts with 'local-'", () => {
    expect(generateLocalTrackId()).toMatch(/^local-/);
  });

  it("contains a UUID v4 after the prefix", () => {
    const id = generateLocalTrackId();
    const uuid = id.slice("local-".length);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates a unique id on each call", () => {
    expect(generateLocalTrackId()).not.toBe(generateLocalTrackId());
  });
});

// ─── isLocalTrack ─────────────────────────────────────────────────────────────

describe("isLocalTrack", () => {
  it("returns true for a generated local track id", () => {
    expect(isLocalTrack(generateLocalTrackId())).toBe(true);
  });

  it("returns true for any string starting with 'local-'", () => {
    expect(isLocalTrack("local-abc")).toBe(true);
  });

  it("returns false for a non-local track id", () => {
    expect(isLocalTrack("12345")).toBe(false);
    expect(isLocalTrack("discogs-123")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalTrack("")).toBe(false);
  });

  it("returns false for 'LOCAL-' (case-sensitive)", () => {
    expect(isLocalTrack("LOCAL-abc")).toBe(false);
  });
});

// ─── isLocalAlbum ─────────────────────────────────────────────────────────────

describe("isLocalAlbum", () => {
  it("returns true for a generated local release id", () => {
    expect(isLocalAlbum(generateLocalReleaseId())).toBe(true);
  });

  it("returns true for any string starting with 'local-'", () => {
    expect(isLocalAlbum("local-release-xyz")).toBe(true);
  });

  it("returns false for a non-local release id", () => {
    expect(isLocalAlbum("discogs-42")).toBe(false);
    expect(isLocalAlbum("42")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalAlbum("")).toBe(false);
  });
});
