import { describe, expect, it } from "vitest";
import {
  appleMusicResultSchema,
  discogsDeleteReleasesRequestSchema,
  discogsLookupResponseSchema,
  discogsReleaseSchema,
  discogsUserLookupResponseSchema,
  discogsUsernameSchema,
  providerAppleMusicSearchResponseSchema,
  providerJsonSchemas,
  providerTrackMetadataRequestSchema,
  providerTrackMetadataResponseSchema,
  providerYouTubeMusicSearchResponseSchema,
} from "./providers.js";

const release = {
  id: 123,
  title: "Album",
  tracklist: [{ position: "A1", title: "One", duration: "3:00", artists: [{ name: "Artist" }] }],
  date_added: "2024-01-01",
  date_changed: "2024-01-02",
  extra_discogs_field: { nested: true },
};

describe("provider contracts", () => {
  it("keeps the provider's extra fields on a release export", () => {
    const parsed = discogsReleaseSchema.parse(release);
    expect(parsed).toHaveProperty("extra_discogs_field");
    expect(discogsReleaseSchema.safeParse({ ...release, tracklist: undefined }).success).toBe(
      false,
    );
  });

  it("accepts the lenient release-lookup response the route returns", () => {
    expect(discogsLookupResponseSchema.safeParse({}).success).toBe(true);
    const parsed = discogsLookupResponseSchema.parse({
      releaseId: "123",
      filePath: "/x.json",
      release: { id: "123", tracklist: [{ position: "A1", title: "One", duration: "" }] },
      matchedTrack: { position: "A1", title: "One", duration: "" },
      future: 1,
    });
    expect(parsed).toHaveProperty("future");
    expect(
      discogsLookupResponseSchema.safeParse({ release: null, matchedTrack: null }).success,
    ).toBe(true);
  });

  it("validates delete requests and Discogs usernames", () => {
    expect(
      discogsDeleteReleasesRequestSchema.safeParse({ username: "u", releaseIds: ["1"] }).success,
    ).toBe(true);
    expect(
      discogsDeleteReleasesRequestSchema.safeParse({ username: "", releaseIds: [] }).success,
    ).toBe(false);
    expect(discogsUsernameSchema.parse(" a.b-c_1 ")).toBe("a.b-c_1");
    expect(discogsUsernameSchema.safeParse("bad name").success).toBe(false);
  });

  it("discriminates user lookups on found", () => {
    expect(
      discogsUserLookupResponseSchema.safeParse({ username: "u", found: true, release_count: 2 })
        .success,
    ).toBe(true);
    expect(discogsUserLookupResponseSchema.safeParse({ username: "u", found: true }).success).toBe(
      false,
    );
    expect(discogsUserLookupResponseSchema.safeParse({ username: "u", found: false }).success).toBe(
      true,
    );
  });

  it("types the provider search results", () => {
    expect(appleMusicResultSchema.safeParse({ id: "1" }).success).toBe(true);
    expect(appleMusicResultSchema.safeParse({ title: "x" }).success).toBe(false);
    expect(
      providerAppleMusicSearchResponseSchema.safeParse({ results: [{ id: "1", duration: 1000 }] })
        .success,
    ).toBe(true);
    expect(
      providerYouTubeMusicSearchResponseSchema.safeParse({
        results: [{ id: "a", title: "t", url: "u", channel: "c" }],
      }).success,
    ).toBe(true);
    expect(
      providerYouTubeMusicSearchResponseSchema.safeParse({ results: [{ id: "a" }] }).success,
    ).toBe(false);
  });

  it("requires a prompt and taxonomy genres for OpenAI metadata", () => {
    expect(providerTrackMetadataRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(
      providerTrackMetadataRequestSchema.safeParse({ prompt: "p", track_id: "1-A1" }).success,
    ).toBe(true);
    expect(
      providerTrackMetadataResponseSchema.safeParse({ genres: [], descriptors: [], notes: "" })
        .success,
    ).toBe(true);
  });

  it("publishes components that reference no external ids", () => {
    expect(Object.keys(providerJsonSchemas)).toContain("ProviderTrackMetadataResponse");
    expect(providerJsonSchemas.ProviderTrackMetadataRequest).toMatchObject({
      required: ["prompt"],
    });
    expect(JSON.stringify(providerJsonSchemas)).not.toContain('"$id"');
    expect(providerJsonSchemas.DiscogsDeleteReleasesResponse).toMatchObject({
      properties: { deletedFromDb: { type: "integer" } },
    });
  });
});
