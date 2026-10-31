import { z } from "zod";

const count = z.number().int().nonnegative();
const duration = z.object({
  track_count: count,
  duration_seconds: z.number().nonnegative().describe("Sum of known track durations in seconds."),
  duration_known_share: z
    .number()
    .min(0)
    .max(1)
    .describe("Share of playlist entries with a known duration; zero if none."),
});
export const homeQuerySchema = z.object({ friend_id: z.number().int().positive() });
export const homeResponseSchema = z.object({
  counts: z.object({
    tracks: count,
    albums: count,
    playlists: count.describe(
      "Playlists containing at least one track belonging to this friend; excludes empty playlists.",
    ),
  }),
  new_arrivals: z.object({
    window_days: z.literal(30),
    unrated_count: count.describe(
      "Albums with a null rating across the entire 30-day window, before the five-item limit.",
    ),
    items: z
      .array(
        z.object({
          release_id: z.string(),
          title: z.string(),
          artist: z.string(),
          thumbnail: z.string().nullable(),
          date_added: z.iso.datetime(),
          play_count: count.describe(
            "All-time track spin events across both media, plus one per session with no events.",
          ),
          album_rating: z.number().int().nullable(),
        }),
      )
      .max(5),
  }),
  attention: z.object({
    missing_audio: count,
    missing_bpm_or_key: count,
    due_for_cleaning: count,
    failed_jobs: count
      .nullable()
      .describe(
        "Failed jobs for this friend updated within the last seven days; null if Redis is unavailable.",
      ),
  }),
  playlists: z.object({
    draft_set: duration
      .extend({
        id: z.number().int(),
        playlist_id: z.number().int(),
        title: z.string().nullable(),
        location_name: z.string().nullable(),
      })
      .nullable(),
    recent: z
      .array(
        duration.extend({
          id: z.number().int(),
          name: z.string(),
          created_at: z.iso.datetime(),
        }),
      )
      .max(3),
  }),
});
export type HomeQuery = z.infer<typeof homeQuerySchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
export const homeJsonSchemas = { HomeResponse: z.toJSONSchema(homeResponseSchema) };
