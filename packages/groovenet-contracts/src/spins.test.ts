import { describe, expect, it } from "vitest";
import {
  SPIN_MEDIA,
  SPIN_PROVENANCES,
  SPIN_SELECTION_MODES,
  SPIN_SELECTION_TYPES,
  spinAggregateRequestSchema,
  spinAggregateResultSchema,
  spinCreateObjectSchema,
  spinCreateResponseSchema,
  spinCreateSchema,
  spinDeleteResponseSchema,
  spinJsonSchemas,
  spinListQuerySchema,
  spinListResponseSchema,
  spinSessionSchema,
  spinTopTracksQuerySchema,
  spinTopTracksResponseSchema,
  spinUpdateSchema,
} from "./spins.js";

const session = {
  id: 4,
  friend_id: 1,
  release_id: "r1",
  medium: "vinyl" as const,
  selection_mode: "sides" as const,
  played_at: "2026-10-01T20:00:00.000Z",
  created_at: "2026-10-01T20:00:00.000Z",
  updated_at: "2026-10-01T20:00:00.000Z",
};

const derived = {
  is_full_album_spin: false,
  selected_side_count: 1,
  album_side_count: 2,
  track_count: 4,
};

const event = {
  friend_id: 1,
  release_id: "r1",
  track_id: "t1",
  played_at: session.played_at,
  ordinal: 0,
};

const create = { friend_id: 1, release_id: "r1", played_at: session.played_at };

describe("spin contracts", () => {
  it("accepts optional, nullable, trimmed digital outputs and rejects vinyl outputs", () => {
    const digital = {
      ...create,
      medium: "digital",
      track_refs: [{ track_id: "t1", friend_id: 1 }],
    };
    expect(spinCreateSchema.parse(digital).output_name).toBeUndefined();
    expect(spinCreateSchema.parse({ ...digital, output_name: null }).output_name).toBeNull();
    expect(spinCreateSchema.parse({ ...digital, output_name: " Lounge " }).output_name).toBe(
      "Lounge",
    );
    for (const output_name of [" ", "x".repeat(256), 7]) {
      expect(spinCreateSchema.safeParse({ ...digital, output_name }).success).toBe(false);
    }
    for (const medium of [undefined, "vinyl"]) {
      expect(
        spinCreateSchema.safeParse({ ...digital, medium, output_name: "Lounge" }).success,
      ).toBe(false);
      expect(spinCreateSchema.safeParse({ ...digital, medium, output_name: null }).success).toBe(
        true,
      );
    }
    for (const output_name of [null, "Lounge"]) {
      expect(spinSessionSchema.parse({ ...session, output_name }).output_name).toBe(output_name);
    }
  });
  it("fixes the enum vocabularies the database CHECK constraints mirror", () => {
    expect(SPIN_SELECTION_MODES).toEqual(["sides", "tracks", "automatic", "playlist"]);
    expect(SPIN_PROVENANCES).toEqual(["manual", "automatic", "playlist"]);
    expect(SPIN_SELECTION_TYPES).toEqual(["side", "track"]);
    expect(spinSessionSchema.safeParse({ ...session, selection_mode: "shuffle" }).success).toBe(
      false,
    );
    expect(spinSessionSchema.safeParse({ ...session, provenance: "imported" }).success).toBe(false);
    expect(SPIN_MEDIA).toEqual(["vinyl", "digital"]);
    expect(spinSessionSchema.safeParse({ ...session, medium: "digital" }).success).toBe(true);
    expect(spinSessionSchema.safeParse({ ...session, medium: "cassette" }).success).toBe(false);
    expect(
      spinCreateSchema.safeParse({ ...create, medium: "digital", side_keys: ["A"] }).success,
    ).toBe(true);
    expect(
      spinCreateSchema.safeParse({ ...create, medium: "cassette", side_keys: ["A"] }).success,
    ).toBe(false);
  });

  it("accepts playlist-made sessions and nullable optional fields", () => {
    const playlist = spinSessionSchema.parse({
      ...session,
      selection_mode: "playlist",
      provenance: "playlist",
      note: null,
      context_type: null,
      source_id: null,
      confidence: null,
      playlist_id: 9,
      live_set_performance_id: null,
      playlist_played_at: session.played_at,
      playlist_position: 2,
      corrected_at: null,
    });
    expect(playlist.playlist_id).toBe(9);
    expect(spinSessionSchema.safeParse({ ...session, id: undefined }).success).toBe(false);
  });

  it("validates a create response and its selections", () => {
    const parsed = spinCreateResponseSchema.parse({
      session,
      selections: [{ ordinal: 0, selection_type: "side", side_key: "A" }],
      expanded_tracks: [event],
      derived,
    });
    expect(parsed.selections[0].selection_type).toBe("side");
    expect(
      spinCreateResponseSchema.safeParse({
        session,
        selections: [{ ordinal: 0, selection_type: "disc" }],
        expanded_tracks: [],
        derived,
      }).success,
    ).toBe(false);
  });

  it("requires exactly one non-empty selection to create a spin", () => {
    expect(spinCreateSchema.safeParse({ ...create, side_keys: ["A"] }).success).toBe(true);
    expect(
      spinCreateSchema.safeParse({ ...create, track_refs: [{ track_id: "t1", friend_id: 1 }] })
        .success,
    ).toBe(true);

    const neither = spinCreateSchema.safeParse(create);
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0].message).toBe("Provide exactly one of side_keys or track_refs");
    expect(spinCreateSchema.safeParse({ ...create, side_keys: [] }).success).toBe(false);
    expect(
      spinCreateSchema.safeParse({
        ...create,
        side_keys: ["A"],
        track_refs: [{ track_id: "t1", friend_id: 1 }],
      }).success,
    ).toBe(false);
    // An empty list beside a real one is not "both": the service rejects it.
    expect(
      spinCreateSchema.safeParse({
        ...create,
        side_keys: [],
        track_refs: [{ track_id: "t1", friend_id: 1 }],
      }).success,
    ).toBe(true);
  });

  it("requires ids and timestamps on create, and strips unknown keys", () => {
    expect(spinCreateObjectSchema.safeParse({ ...create, release_id: "" }).success).toBe(false);
    expect(spinCreateObjectSchema.safeParse({ ...create, played_at: "" }).success).toBe(false);
    expect(spinCreateObjectSchema.safeParse({ ...create, side_keys: [""] }).success).toBe(false);
    expect(
      spinCreateObjectSchema.safeParse({ ...create, track_refs: [{ track_id: "", friend_id: 1 }] })
        .success,
    ).toBe(false);
    expect(spinCreateObjectSchema.safeParse({ ...create, friend_id: 1.5 }).success).toBe(false);
    expect(spinCreateObjectSchema.parse({ ...create, note: null, extra: 1 })).not.toHaveProperty(
      "extra",
    );
  });

  it("requires a change, and at most one selection form, on update", () => {
    expect(spinUpdateSchema.safeParse({ friend_id: 1, note: null }).success).toBe(true);
    expect(spinUpdateSchema.safeParse({ friend_id: 1, side_keys: ["B"] }).success).toBe(true);

    const nothing = spinUpdateSchema.safeParse({ friend_id: 1 });
    expect(nothing.success).toBe(false);
    expect(nothing.error?.issues[0].message).toBe("Nothing to update");

    const both = spinUpdateSchema.safeParse({
      friend_id: 1,
      side_keys: ["A"],
      track_refs: [{ track_id: "t1", friend_id: 1 }],
    });
    expect(both.success).toBe(false);
    expect(both.error?.issues[0].message).toBe("Provide at most one of side_keys or track_refs");

    expect(spinUpdateSchema.safeParse({ friend_id: 1, side_keys: [] }).success).toBe(false);
    expect(spinUpdateSchema.safeParse({ friend_id: 1, track_refs: [] }).success).toBe(false);
    expect(spinUpdateSchema.safeParse({ friend_id: 1, played_at: "" }).success).toBe(false);
  });

  it("validates list, delete and top-tracks responses", () => {
    const detail = {
      session,
      selections: [],
      track_events: [event],
      derived,
      album: { title: "Album", artist: null, thumbnail: null },
    };
    expect(
      spinListResponseSchema.parse({
        items: [detail, { ...detail, album: null }],
        limit: 50,
        offset: 0,
      }).items,
    ).toHaveLength(2);
    expect(
      spinListResponseSchema.parse({
        items: [{ ...detail, album: undefined }],
        limit: 50,
        offset: 0,
      }).items[0].album,
    ).toBeUndefined();
    expect(spinDeleteResponseSchema.parse({ success: true, session }).session.id).toBe(4);

    const top = {
      friend_id: 1,
      release_id: "r1",
      track_id: "t1",
      play_count: 3,
      last_played_at: session.played_at,
      title_snapshot: "Title",
      artist_snapshot: "Artist",
      album_snapshot: "Album",
    };
    const parsed = spinTopTracksResponseSchema.parse({
      items: [
        top,
        { ...top, bpm: "120", key: null, styles: ["House"], hasVectors: true, track_genres: [] },
      ],
      limit: 20,
      offset: 0,
    });
    expect(parsed.items[1].bpm).toBe("120");
    expect(
      spinTopTracksResponseSchema.safeParse({
        items: [{ ...top, play_count: "3" }],
        limit: 20,
        offset: 0,
      }).success,
    ).toBe(false);
  });

  it("validates the aggregate request and result", () => {
    expect(spinAggregateRequestSchema.safeParse({ since: "2026-10-01T00:00:00Z" }).success).toBe(
      true,
    );
    expect(
      spinAggregateRequestSchema.safeParse({ since: "2026-10-01T00:00:00Z", source_id: "pi" })
        .success,
    ).toBe(true);
    expect(spinAggregateRequestSchema.safeParse({ since: "" }).success).toBe(false);
    expect(
      spinAggregateRequestSchema.safeParse({ since: "2026-10-01", source_id: "" }).success,
    ).toBe(false);
    expect(
      spinAggregateResultSchema.parse({
        since: "2026-10-01T00:00:00Z",
        created: 2,
        skipped: 1,
        sources: [{ source_id: "pi", created: 2, skipped: 1 }],
      }).sources,
    ).toHaveLength(1);
  });

  it("describes the wire queries; defaults stay in the app", () => {
    expect(spinListQuerySchema.parse({ friend_id: 1 })).toEqual({ friend_id: 1 });
    expect(spinListQuerySchema.safeParse({ friend_id: 1, limit: -1 }).success).toBe(false);
    expect(spinListQuerySchema.safeParse({ friend_id: 1, offset: 0.5 }).success).toBe(false);
    expect(spinListQuerySchema.parse({ friend_id: 1, medium: "digital", cursor: "abc" })).toEqual({
      friend_id: 1,
      medium: "digital",
      cursor: "abc",
    });
    expect(spinListQuerySchema.safeParse({ friend_id: 1, medium: "tape" }).success).toBe(false);
    expect(spinListQuerySchema.safeParse({ friend_id: 1, cursor: "" }).success).toBe(false);
    expect(
      spinListResponseSchema.parse({ items: [], limit: 50, offset: 0, next_cursor: "abc" })
        .next_cursor,
    ).toBe("abc");
    expect(
      spinListResponseSchema.parse({ items: [], limit: 50, offset: 0, next_cursor: null })
        .next_cursor,
    ).toBeNull();
    expect(
      spinTopTracksQuerySchema.parse({ friend_id: 1, release_id: "r1", limit: 5, offset: 0 }).limit,
    ).toBe(5);
    expect(spinTopTracksQuerySchema.safeParse({ release_id: "r1" }).success).toBe(false);
  });

  it("publishes enums, responses and input-shaped request bodies for OpenAPI", () => {
    expect(spinJsonSchemas.SpinSelectionMode.enum).toEqual([
      "sides",
      "tracks",
      "automatic",
      "playlist",
    ]);
    expect(spinJsonSchemas.SpinProvenance.enum).toEqual(["manual", "automatic", "playlist"]);
    expect(spinJsonSchemas.SpinSelectionType.enum).toEqual(["side", "track"]);
    expect(spinJsonSchemas.SpinSession.properties.selection_mode.enum).toEqual([
      "sides",
      "tracks",
      "automatic",
      "playlist",
    ]);
    expect(spinJsonSchemas.SpinSession.properties.played_at.format).toBe("date-time");
    expect(spinJsonSchemas.SpinSession.required).toEqual(
      expect.arrayContaining([
        "id",
        "friend_id",
        "release_id",
        "medium",
        "selection_mode",
        "played_at",
      ]),
    );
    expect(spinJsonSchemas.SpinListResponse.required).toEqual(["items", "limit", "offset"]);
    expect(spinJsonSchemas.SpinTopTracksResponse.required).toEqual(["items", "limit", "offset"]);

    // Request bodies strip unknown keys, so they must not claim to reject them.
    for (const name of ["SpinCreateInput", "SpinUpdateInput", "SpinAggregateRequest"] as const) {
      expect(spinJsonSchemas[name].additionalProperties).not.toBe(false);
    }
    expect(spinJsonSchemas.SpinCreateInput.required).toEqual([
      "friend_id",
      "release_id",
      "played_at",
    ]);
    expect(spinJsonSchemas.SpinCreateInput.properties.played_at.format).toBe("date-time");
    expect(spinJsonSchemas.SpinUpdateInput.required).toEqual(["friend_id"]);
    expect(spinJsonSchemas.SpinUpdateInput.properties.side_keys.minItems).toBe(1);
    expect(spinJsonSchemas.SpinAggregateRequest.required).toEqual(["since"]);
  });
});

import { spinRecapQuerySchema, spinRecapResponseSchema } from "./spins.js";
it("validates the recap month and empty response", () => {
  expect(spinRecapQuerySchema.safeParse({ friend_id: 1, month: "2026-10" }).success).toBe(true);
  expect(spinRecapQuerySchema.safeParse({ friend_id: 1, month: "2026-13" }).success).toBe(false);
  expect(spinRecapResponseSchema.safeParse({}).success).toBe(false);
});

import { spinTrackStatsQuerySchema, spinTrackStatsResponseSchema } from "./spins.js";
it("validates the track-stats query and a never-spun response", () => {
  expect(spinTrackStatsQuerySchema.safeParse({ friend_id: 1, track_id: "t1" }).success).toBe(true);
  expect(spinTrackStatsQuerySchema.safeParse({ friend_id: 1, track_id: "" }).success).toBe(false);
  expect(
    spinTrackStatsResponseSchema.safeParse({ play_count: 0, last_played_at: null }).success,
  ).toBe(true);
  expect(spinJsonSchemas.SpinTrackStatsResponse.required).toEqual(["play_count", "last_played_at"]);
});
