import { describe, expect, it } from "vitest";
import {
  spinCreateBodySchema,
  spinListItemSchema,
  spinListQuerySchema,
  spinTopTrackItemSchema,
  spinTopTracksQuerySchema,
  spinUpdateBodySchema,
} from "./schemas.js";

describe("spin schemas (shapes from @groovenet/contracts, coercion here)", () => {
  it("coerces a text friend_id and applies the list page defaults", () => {
    expect(spinListQuerySchema.parse({ friend_id: "2" })).toEqual({
      friend_id: 2,
      limit: 50,
      offset: 0,
    });
    expect(spinListQuerySchema.parse({ friend_id: 2, limit: "10", offset: "5" })).toMatchObject({
      limit: 10,
      offset: 5,
    });
    expect(spinListQuerySchema.parse({ friend_id: 2, medium: "vinyl", cursor: "c" })).toMatchObject(
      {
        medium: "vinyl",
        cursor: "c",
        offset: 0,
      },
    );
    expect(spinListQuerySchema.safeParse({ friend_id: 2, medium: "tape" }).success).toBe(false);
    expect(spinListQuerySchema.safeParse({ friend_id: 2, cursor: "c", offset: 5 }).success).toBe(
      false,
    );
    expect(spinListQuerySchema.safeParse({ friend_id: "nope" }).success).toBe(false);
    expect(spinListQuerySchema.safeParse({ friend_id: 1, limit: "-1" }).success).toBe(false);
  });

  it("applies the top-tracks page defaults", () => {
    expect(spinTopTracksQuerySchema.parse({ friend_id: "2" })).toEqual({
      friend_id: 2,
      limit: 20,
      offset: 0,
    });
    expect(spinTopTracksQuerySchema.safeParse({ friend_id: 1, offset: "x" }).success).toBe(false);
  });

  it("requires exactly one selection form to create a spin", () => {
    const base = { friend_id: "1", release_id: "r1", played_at: "2026-10-01T20:00:00.000Z" };
    expect(spinCreateBodySchema.parse({ ...base, side_keys: ["A"] }).friend_id).toBe(1);
    expect(spinCreateBodySchema.safeParse(base).success).toBe(false);
    expect(
      spinCreateBodySchema.safeParse({
        ...base,
        side_keys: ["A"],
        track_refs: [{ track_id: "t1", friend_id: 1 }],
      }).success,
    ).toBe(false);
  });

  it("requires a change, and at most one selection form, to update a spin", () => {
    expect(spinUpdateBodySchema.parse({ friend_id: "1", note: null }).friend_id).toBe(1);
    expect(spinUpdateBodySchema.safeParse({ friend_id: 1 }).success).toBe(false);
    expect(
      spinUpdateBodySchema.safeParse({
        friend_id: 1,
        side_keys: ["A"],
        track_refs: [{ track_id: "t1", friend_id: 1 }],
      }).success,
    ).toBe(false);
  });

  it("accepts the playlist selection mode and provenance the server now writes", () => {
    const session = {
      id: 1,
      friend_id: 1,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: "playlist",
      provenance: "playlist",
      played_at: "2026-10-01T20:00:00.000Z",
      created_at: "2026-10-01T20:00:00.000Z",
      updated_at: "2026-10-01T20:00:00.000Z",
    };
    const detail = {
      session,
      selections: [],
      track_events: [],
      derived: {
        is_full_album_spin: false,
        selected_side_count: 0,
        album_side_count: 0,
        track_count: 0,
      },
    };
    expect(spinListItemSchema.parse(detail).session.selection_mode).toBe("playlist");
    expect(
      spinListItemSchema.safeParse({
        ...detail,
        session: { ...session, selection_mode: "shuffle" },
      }).success,
    ).toBe(false);
  });

  it("keeps the extra fields top-tracks rows carry", () => {
    const row = {
      friend_id: 1,
      release_id: "r1",
      track_id: "t1",
      play_count: 2,
      last_played_at: "2026-10-01T20:00:00.000Z",
      title_snapshot: "T",
      artist_snapshot: "A",
      album_snapshot: "B",
      bpm: "120",
      local_audio_url: null,
    };
    expect(spinTopTrackItemSchema.parse(row)).toMatchObject({ bpm: "120", local_audio_url: null });
  });
});
