import { describe, expect, it } from "vitest";
import {
  liveSetDeleteResponseSchema,
  liveSetJsonSchemas,
  liveSetMediaTypeSchema,
  liveSetSchema,
  liveSetStatusSchema,
  liveSetSummarySchema,
  liveSetUpdateSchema,
} from "./liveSets.js";

describe("live-set contracts", () => {
  it("validates the shared status and media enums", () => {
    expect(liveSetStatusSchema.parse("performed")).toBe("performed");
    expect(liveSetStatusSchema.safeParse("scheduled").success).toBe(false);
    expect(liveSetMediaTypeSchema.parse("youtube")).toBe("youtube");
    expect(liveSetMediaTypeSchema.safeParse("stream").success).toBe(false);
  });

  it("validates a live set while preserving database response fields", () => {
    const result = liveSetSchema.parse({
      id: 4,
      playlist_id: 9,
      title: "Sunday set",
      status: "performed",
      notes: null,
      location_name: "The club",
      location_city: "Oakland",
      cover_image_url: null,
      collaborators: [{ friend_id: 2, username: "dj", role: "host" }],
      performances: [
        {
          id: 11,
          performed_at: "2026-10-01T20:00:00.000Z",
          venue_name: "The club",
          location_city: "Oakland",
          notes: null,
        },
      ],
      media: [
        {
          id: 12,
          media_type: "flyer",
          url: "https://example.com/flyer.jpg",
          filename: null,
          caption: null,
          position: 0,
        },
      ],
      database_extension: true,
    });

    expect(result.performances[0]?.id).toBe(11);
    expect(result.media[0]?.position).toBe(0);
    expect(result.database_extension).toBe(true);
  });

  it("validates summary, update, and delete payloads", () => {
    expect(
      liveSetSummarySchema.safeParse({
        id: 4,
        title: null,
        status: "draft",
        cover_image_url: null,
        last_performed_at: null,
        venue_name: null,
        location_city: null,
        collaborators: [],
      }).success,
    ).toBe(true);

    expect(
      liveSetUpdateSchema.safeParse({
        status: "archived",
        media: [{ media_type: "image", url: "https://example.com/cover.jpg" }],
      }).success,
    ).toBe(true);
    expect(
      liveSetUpdateSchema.safeParse({ media: [{ media_type: "stream", url: "x" }] }).success,
    ).toBe(false);
    expect(liveSetDeleteResponseSchema.safeParse({ success: true }).success).toBe(true);
    expect(liveSetDeleteResponseSchema.safeParse({ success: false }).success).toBe(false);
  });

  it("exports OpenAPI-compatible enum schemas from the same definitions", () => {
    expect(liveSetJsonSchemas.LiveSetStatus.enum).toEqual(["draft", "performed", "archived"]);
    expect(liveSetJsonSchemas.LiveSetMediaType.enum).toEqual([
      "image",
      "flyer",
      "audio",
      "youtube",
      "link",
    ]);
    expect(liveSetJsonSchemas.LiveSetUpdate).toBeDefined();
  });
});
