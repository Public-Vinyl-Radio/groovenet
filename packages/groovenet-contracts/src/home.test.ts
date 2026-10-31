import { expect, it } from "vitest";
import { homeJsonSchemas, homeQuerySchema, homeResponseSchema } from "./home.js";
const empty = {
  counts: { tracks: 0, albums: 0, playlists: 0 },
  new_arrivals: { window_days: 30, unrated_count: 0, items: [] },
  attention: { missing_audio: 0, missing_bpm_or_key: 0, due_for_cleaning: 0, failed_jobs: null },
  playlists: { draft_set: null, recent: [] },
};
it("validates the empty response and nullable Redis count", () => {
  expect(homeResponseSchema.parse(empty)).toEqual(empty);
  expect(homeQuerySchema.parse({ friend_id: 7 })).toEqual({ friend_id: 7 });
  expect(homeJsonSchemas.HomeResponse).toHaveProperty("properties");
});
it("validates arrival and playlist duration metadata", () => {
  const durations = { track_count: 2, duration_seconds: 120, duration_known_share: 0.5 };
  const response = {
    ...empty,
    new_arrivals: {
      window_days: 30,
      unrated_count: 8,
      items: [
        {
          release_id: "r",
          title: "T",
          artist: "A",
          thumbnail: null,
          date_added: "2026-10-31T12:00:00Z",
          play_count: 2,
          album_rating: null,
        },
      ],
    },
    playlists: {
      draft_set: { ...durations, id: 1, playlist_id: 2, title: null, location_name: null },
      recent: [{ ...durations, id: 2, name: "P", created_at: "2026-10-31T12:00:00Z" }],
    },
  };
  expect(homeResponseSchema.parse(response)).toEqual(response);
  expect(
    homeResponseSchema.safeParse({ ...empty, attention: { ...empty.attention, failed_jobs: -1 } })
      .success,
  ).toBe(false);
});
