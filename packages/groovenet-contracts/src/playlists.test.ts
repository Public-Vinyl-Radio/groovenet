import { describe, expect, it } from "vitest";
import {
  playlistCreateSchema,
  playlistDeleteResponseSchema,
  playlistDetailSchema,
  playlistGeneticRequestSchema,
  playlistGeneticResponseSchema,
  playlistGeneticValidationErrorSchema,
  playlistJsonSchemas,
  playlistOptimizerModeSchema,
  playlistSchema,
  playlistSpinsInputSchema,
  playlistSpinsResultSchema,
  playlistUpdateSchema,
} from "./playlists.js";

describe("playlist contracts", () => {
  it("validates the optimizer mode enum", () => {
    for (const mode of ["genetic", "greedy", "cohesive_blocks"]) {
      expect(playlistOptimizerModeSchema.parse(mode)).toBe(mode);
    }
    expect(playlistOptimizerModeSchema.safeParse("random").success).toBe(false);
  });

  it("validates a playlist with an attached set summary and extra database fields", () => {
    const result = playlistSchema.parse({
      id: 1,
      name: "Warmup",
      created_at: "2026-10-01T20:00:00.000Z",
      total_duration_seconds: 600,
      tracks: [{ track_id: "t1", friend_id: 2, position: 0 }, { track_id: "t2", friend_id: 3, position: 1 }],
      set: {
        id: 4,
        title: null,
        status: "draft",
        cover_image_url: null,
        last_performed_at: null,
        venue_name: null,
        location_city: null,
        collaborators: [],
        flyer_url: "/f.jpg",
        recording_url: "https://example.com/rec.mp3",
        post_url: null,
      },
      cover_urls: ["/a.jpg", "/b.jpg"],
      extension: true,
    });
    expect(result.cover_urls).toEqual(["/a.jpg", "/b.jpg"]);
    expect(result.set?.flyer_url).toBe("/f.jpg");
    expect(result.set?.post_url).toBeNull();
    expect(result.tracks).toHaveLength(2);
    expect(result.extension).toBe(true);
    expect(playlistSchema.safeParse({ id: 1, name: "x", tracks: [] }).success).toBe(false);
    expect(
      playlistSchema.safeParse({ id: 1, name: "x", created_at: "", tracks: [{ track_id: "t1" }] }).success
    ).toBe(false);
    expect(
      playlistSchema.safeParse({ id: 1, name: "x", created_at: "", tracks: [], set: { id: 1, status: "live" } }).success
    ).toBe(false);
  });

  it("defaults tracks on create and accepts bare ids or objects on update", () => {
    expect(playlistCreateSchema.parse({ name: "New" }).tracks).toEqual([]);
    expect(playlistCreateSchema.safeParse({ tracks: [] }).success).toBe(false);
    expect(
      playlistUpdateSchema.safeParse({ id: 3, tracks: ["a", { track_id: "b", friend_id: 1, spotify_url: null }] }).success
    ).toBe(true);
    expect(playlistUpdateSchema.safeParse({ id: "3" }).success).toBe(false);
  });

  it("validates detail and delete payloads", () => {
    expect(playlistDetailSchema.safeParse({ playlist_id: 1, playlist_name: null, tracks: [] }).success).toBe(true);
    expect(playlistDetailSchema.safeParse({ playlist_id: 1 }).success).toBe(false);
    expect(playlistDeleteResponseSchema.safeParse({ success: true }).success).toBe(true);
    expect(playlistDeleteResponseSchema.safeParse({ success: false }).success).toBe(false);
  });

  it("rejects spins input that names both a timestamp and a performance", () => {
    expect(playlistSpinsInputSchema.safeParse({}).success).toBe(true);
    expect(playlistSpinsInputSchema.safeParse({ performed_at: "2026-10-01T20:00:00Z" }).success).toBe(true);
    expect(playlistSpinsInputSchema.safeParse({ performed_at: "not a date" }).success).toBe(false);
    expect(playlistSpinsInputSchema.safeParse({ performance_id: 0 }).success).toBe(false);
    expect(playlistSpinsInputSchema.safeParse({ derivation_id: "nope" }).success).toBe(false);
    expect(
      playlistSpinsInputSchema.safeParse({ performed_at: "2026-10-01T20:00:00Z", performance_id: 2 }).success
    ).toBe(false);
  });

  it("validates spins results", () => {
    expect(
      playlistSpinsResultSchema.safeParse({
        playlist_id: 1,
        performance_id: null,
        performed_at: "2026-10-01T20:00:00Z",
        created: 2,
        skipped: 0,
      }).success
    ).toBe(true);
    expect(
      playlistSpinsResultSchema.safeParse({
        playlist_id: 1,
        performance_id: null,
        performed_at: "x",
        created: -1,
        skipped: 0,
      }).success
    ).toBe(false);
  });

  it("validates genetic requests, array and keyed results, and invalid-track errors", () => {
    expect(
      playlistGeneticRequestSchema.safeParse({ playlist: [{ track_id: "a", bpm: "120" }], mode: "greedy" }).success
    ).toBe(true);
    expect(playlistGeneticRequestSchema.safeParse({ playlist: [] }).success).toBe(false);
    expect(playlistGeneticRequestSchema.safeParse({ playlist: [{ track_id: "a" }], mode: "x" }).success).toBe(false);
    expect(playlistGeneticResponseSchema.safeParse({ result: [{ track_id: "a" }] }).success).toBe(true);
    expect(
      playlistGeneticResponseSchema.safeParse({ mode: "genetic", result: { 0: { track_id: "a" } } }).success
    ).toBe(true);
    expect(playlistGeneticResponseSchema.safeParse({ result: [{ track_id: "" }] }).success).toBe(false);
    expect(
      playlistGeneticValidationErrorSchema.safeParse({
        error: "bad",
        invalid: [{ reason: "missing_bpm" }],
        invalid_count: 1,
      }).success
    ).toBe(true);
  });

  it("exports JSON Schema components with enum values", () => {
    expect(Object.keys(playlistJsonSchemas)).toContain("Playlist");
    expect(playlistJsonSchemas.PlaylistOptimizerMode.enum).toEqual(["genetic", "greedy", "cohesive_blocks"]);
    expect(playlistJsonSchemas.PlaylistCreate.required).toEqual(["name"]);
    expect(playlistJsonSchemas.PlaylistSpinsInput.properties).toHaveProperty("derivation_id");
  });
});
