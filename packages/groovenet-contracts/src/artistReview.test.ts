import { expect, it } from "vitest";
import {
  artistReviewBodySchema,
  artistReviewListSchema,
  artistReviewQuerySchema,
  artistReviewResultSchema,
  artistReviewJsonSchemas,
} from "./artistReview.js";
it("parses all decisions and supplies the dry-run default", () => {
  for (const decision of [
    { action: "accept", artist_id: 1 },
    { action: "placeholder", artist_id: 1, is_placeholder: true },
    { action: "rename", artist_id: 1, name: "A", sort_name: "A" },
    { action: "merge", artist_id: 1, target_id: 2 },
    { action: "unmerge", merge_id: 3 },
    {
      action: "split",
      artist_id: 1,
      credits: [
        { name: "A", role: "primary", position: 0, credited_as: "A" },
        { artist_id: 2, role: "remixer", position: 1, credited_as: "B" },
      ],
    },
  ]) {
    expect(artistReviewBodySchema.parse({ decision })).toEqual({ decision, dry_run: false });
    expect(artistReviewResultSchema.parse({ decision, dry_run: true })).toEqual({
      decision,
      dry_run: true,
    });
  }
});
it("validates queue defaults, paging, evidence, and merge history", () => {
  expect(artistReviewQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  expect(artistReviewQuerySchema.parse({ artist_id: "2", limit: "5", offset: "10" })).toEqual({
    artist_id: 2,
    limit: 5,
    offset: 10,
  });
  expect(
    artistReviewListSchema.parse({
      items: [
        {
          id: 1,
          name: "A",
          sort_name: "A",
          is_placeholder: false,
          reviewed: false,
          aliases: ["A"],
          albums: [{ discogs: null }],
          tracks: [{ apple_tags: { artist: "A" } }],
          merges: [{ id: 3, source_id: 2, target_id: 1 }],
        },
      ],
    }).items,
  ).toHaveLength(1);
  expect(Object.keys(artistReviewJsonSchemas)).toEqual([
    "ArtistReviewList",
    "ArtistReviewBody",
    "ArtistReviewResult",
  ]);
});
