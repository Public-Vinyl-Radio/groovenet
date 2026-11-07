import { describe, expect, it } from "vitest";
import {
  artistJsonSchemas,
  artistReconcileRequestSchema,
  artistReconcileResponseSchema,
} from "./artists.js";

describe("artist reconcile contracts", () => {
  it("accepts an empty body, a dry run and a friend scope", () => {
    expect(artistReconcileRequestSchema.parse({})).toEqual({});
    expect(artistReconcileRequestSchema.parse({ dry_run: true, friend_id: 6 })).toEqual({
      dry_run: true,
      friend_id: 6,
    });
    expect(artistReconcileRequestSchema.safeParse({ friend_id: 0 }).success).toBe(false);
    expect(artistReconcileRequestSchema.safeParse({ dryRun: true }).success).toBe(false);
  });

  it("accepts a report", () => {
    const counts = { pending: 2, linked: 0, failed: 0 };
    const report = {
      dry_run: true,
      friend_id: null,
      baseline: {
        albums: 2,
        distinct_strings: 2,
        spelling_groups: 0,
        inversions: 1,
        various: 0,
        unknown_artist: 0,
      },
      albums: counts,
      tracks: counts,
      credits: { discogs: 1, legacy: 3 },
      artists: { matched_by_discogs_id: 0, matched_by_name: 1, created: 3 },
      review_queue: [{ credited_as: "Earth, Wind & Fire", albums: 1, tracks: 2 }],
      errors: [{ kind: "track", id: "1-A1", message: "boom" }],
    };
    expect(artistReconcileResponseSchema.parse(report)).toEqual(report);
    expect(
      artistReconcileResponseSchema.safeParse({
        ...report,
        errors: [{ kind: "x", id: "1", message: "" }],
      }).success,
    ).toBe(false);
    expect(Object.keys(artistJsonSchemas)).toEqual([
      "ArtistReconcileRequest",
      "ArtistReconcileResponse",
    ]);
  });
});
