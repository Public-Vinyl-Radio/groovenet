import { beforeEach, describe, it, expect, vi } from "vitest";

const {
  createEmbedding,
  findTrackWithAlbumMetadata,
  upsertTrackEmbedding,
  findEmbeddingSourceHash,
} = vi.hoisted(() => ({
  createEmbedding: vi.fn(),
  findTrackWithAlbumMetadata: vi.fn(),
  upsertTrackEmbedding: vi.fn(),
  findEmbeddingSourceHash: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = { create: createEmbedding };
  },
}));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackWithAlbumMetadata },
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { upsertTrackEmbedding, findEmbeddingSourceHash },
}));

import {
  buildIdentityData,
  buildIdentityText,
  computeSourceHash,
  fetchTrackWithAlbum,
  generateAndStoreIdentityEmbedding,
  generateIdentityEmbedding,
  getIdentityPreview,
  needsEmbeddingUpdate,
  storeIdentityEmbedding,
} from "../identity-embedding";
import type { Track } from "@/types/track";

const mockTrack = {
  id: 1,
  track_id: "test-123",
  friend_id: 1,
  title: "Test Track",
  artist: "Test Artist",
  album: "Test Album",
  year: 1999,
  styles: ["Deep House", "Tech House"],
  genres: ["Electronic", "House"],
  duration: "5:30",
  position: 1,
  discogs_url: "http://discogs.com/test",
  apple_music_url: "http://apple.com/test",
  local_tags: "melodic, peak-time, euphoric",
  album_country: "US",
  album_label: "Warp Records, Ninja Tune",
  album_genres: ["Electronic"],
  album_styles: ["Ambient", "IDM"],
} as unknown as Track;

/** A track built from mockTrack with fields overridden. */
function trackWith(overrides: Record<string, unknown>): Track {
  return { ...mockTrack, ...overrides } as unknown as Track;
}

/** The source hash the pipeline will compute for a given track. */
function hashFor(track: Track): string {
  return computeSourceHash(buildIdentityData(track));
}

const EMBEDDING = [0.1, 0.2, 0.3];

beforeEach(() => {
  vi.clearAllMocks();
  createEmbedding.mockResolvedValue({ data: [{ embedding: EMBEDDING }] });
  findTrackWithAlbumMetadata.mockResolvedValue(mockTrack);
  upsertTrackEmbedding.mockResolvedValue(undefined);
  findEmbeddingSourceHash.mockResolvedValue(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("buildIdentityData", () => {
  const identityData = buildIdentityData(mockTrack);

  it("extracts title and artist", () => {
    expect(identityData.title).toBe("Test Track");
    expect(identityData.artist).toBe("Test Artist");
    expect(identityData.album).toBe("Test Album");
  });

  it("computes era from year", () => {
    expect(identityData.era).toBe("1990s");
  });

  it("normalizes country", () => {
    expect(identityData.country).toBe("us");
  });

  it("parses and normalizes labels", () => {
    expect(identityData.labels).toEqual(["ninja tune", "warp records"]);
  });

  it("uses album genres", () => {
    expect(identityData.genres).toEqual(["electronic"]);
  });

  it("uses album styles", () => {
    expect(identityData.styles).toEqual(["ambient", "idm"]);
  });

  it("filters out DJ-function tags", () => {
    expect(identityData.tags).toEqual(["euphoric", "melodic"]);
  });
});

describe("buildIdentityData fallbacks", () => {
  it("trims surrounding whitespace from the basic fields", () => {
    const data = buildIdentityData(
      trackWith({ title: "  Padded  ", artist: "  Artist  ", album: "  Album  " })
    );

    expect(data).toMatchObject({ title: "Padded", artist: "Artist", album: "Album" });
  });

  it.each([
    ["title", "unknown"],
    ["artist", "unknown"],
    ["album", "unknown"],
  ])("defaults a missing %s to 'unknown'", (field, expected) => {
    const data = buildIdentityData(trackWith({ [field]: null }));

    expect(data[field as "title" | "artist" | "album"]).toBe(expected);
  });

  it("falls back to track genres when the album has none", () => {
    const data = buildIdentityData(trackWith({ album_genres: null }));

    expect(data.genres).toEqual(["electronic", "house"]);
  });

  it("falls back to track styles when the album has none", () => {
    const data = buildIdentityData(trackWith({ album_styles: null }));

    expect(data.styles).toEqual(["deep house", "tech house"]);
  });

  it("produces no labels when the album label is empty", () => {
    expect(buildIdentityData(trackWith({ album_label: "" })).labels).toEqual([]);
    expect(buildIdentityData(trackWith({ album_label: null })).labels).toEqual([]);
  });

  it("splits multiple composers", () => {
    const data = buildIdentityData(trackWith({ composer: "Bach & Glass, Reich" }));

    expect(data.composers).toEqual(["bach", "glass", "reich"]);
  });

  it("produces no composers when the field is absent", () => {
    expect(buildIdentityData(trackWith({ composer: null })).composers).toEqual([]);
  });
});

describe("buildIdentityText", () => {
  it("formats identity data into expected text", () => {
    const identityData = buildIdentityData(mockTrack);
    const expected = [
      "Track: Test Track — Test Artist",
      "Release: Test Album (1990s)",
      "Country: us",
      "Labels: ninja tune, warp records",
      "Genres: electronic",
      "Styles: ambient, idm",
      "Tags: euphoric, melodic",
    ].join("\n");
    expect(buildIdentityText(identityData)).toBe(expected);
  });

  it("includes a Composer line only when composers are present", () => {
    const withComposer = buildIdentityText(
      buildIdentityData(trackWith({ composer: "Steve Reich" }))
    );
    expect(withComposer).toContain("Composer: steve reich");

    const withoutComposer = buildIdentityText(buildIdentityData(mockTrack));
    expect(withoutComposer).not.toContain("Composer:");
  });

  it("places the Composer line between Release and Country", () => {
    const lines = buildIdentityText(
      buildIdentityData(trackWith({ composer: "Steve Reich" }))
    ).split("\n");

    expect(lines[1]).toMatch(/^Release:/);
    expect(lines[2]).toMatch(/^Composer:/);
    expect(lines[3]).toMatch(/^Country:/);
  });

  it("handles missing fields with defaults", () => {
    const sparseTrack = {
      id: 2,
      track_id: "test-456",
      friend_id: 1,
      title: "Sparse Track",
      artist: "Sparse Artist",
      album: "",
      year: null,
      styles: null,
      genres: null,
      duration: "3:00",
      position: 1,
      discogs_url: "",
      apple_music_url: "",
      local_tags: null,
    } as unknown as Track;

    const sparseData = buildIdentityData(sparseTrack);
    const expected = [
      "Track: Sparse Track — Sparse Artist",
      "Release: unknown (unknown-era)",
      "Country: unknown-country",
      "Labels: none",
      "Genres: unknown",
      "Styles: unknown",
      "Tags: none",
    ].join("\n");
    expect(buildIdentityText(sparseData)).toBe(expected);
  });
});

describe("computeSourceHash", () => {
  it("produces a stable SHA256 hash", () => {
    const identityData = buildIdentityData(mockTrack);
    const hash1 = computeSourceHash(identityData);
    const hash2 = computeSourceHash(identityData);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces a different hash for different data", () => {
    const identityData = buildIdentityData(mockTrack);
    const hash1 = computeSourceHash(identityData);
    const hash2 = computeSourceHash({ ...identityData, title: "Different Title" });
    expect(hash1).not.toBe(hash2);
  });

  it("ignores the ordering of list fields", () => {
    const base = buildIdentityData(mockTrack);
    const shuffled = {
      ...base,
      labels: [...base.labels].reverse(),
      genres: [...base.genres].reverse(),
      styles: [...base.styles].reverse(),
      tags: [...base.tags].reverse(),
    };

    expect(computeSourceHash(shuffled)).toBe(computeSourceHash(base));
  });

  it("does not mutate the caller's data", () => {
    const data = buildIdentityData(mockTrack);
    const snapshot = structuredClone(data);

    computeSourceHash(data);

    expect(data).toEqual(snapshot);
  });

  it("hashes hand-built data whose lists are not pre-sorted", () => {
    const base = buildIdentityData(mockTrack);
    const unsorted = { ...base, labels: ["warp records", "ninja tune"] };

    expect(computeSourceHash(unsorted)).toBe(computeSourceHash(base));
    // Still unsorted afterwards — hashing copies rather than sorting in place.
    expect(unsorted.labels).toEqual(["warp records", "ninja tune"]);
  });

  it.each(["era", "country"])("changes when %s changes", (field) => {
    const base = buildIdentityData(mockTrack);

    expect(computeSourceHash({ ...base, [field]: "changed" })).not.toBe(
      computeSourceHash(base)
    );
  });
});

describe("fetchTrackWithAlbum", () => {
  it("delegates to the track repository", async () => {
    await expect(fetchTrackWithAlbum("test-123", 1)).resolves.toBe(mockTrack);
    expect(findTrackWithAlbumMetadata).toHaveBeenCalledWith("test-123", 1);
  });

  it("passes through a missing track as null", async () => {
    findTrackWithAlbumMetadata.mockResolvedValue(null);

    await expect(fetchTrackWithAlbum("nope", 9)).resolves.toBeNull();
  });
});

describe("generateIdentityEmbedding", () => {
  it("requests a text-embedding-3-small embedding and returns the vector", async () => {
    await expect(generateIdentityEmbedding("Track: x")).resolves.toEqual(EMBEDDING);

    expect(createEmbedding).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "Track: x",
    });
  });

  it("propagates an OpenAI failure", async () => {
    const boom = new Error("rate limited");
    createEmbedding.mockRejectedValue(boom);

    await expect(generateIdentityEmbedding("Track: x")).rejects.toBe(boom);
  });
});

describe("storeIdentityEmbedding", () => {
  it("upserts with the identity type and default model and dims", async () => {
    await storeIdentityEmbedding("test-123", 1, EMBEDDING, "hash-1", "Track: x");

    expect(upsertTrackEmbedding).toHaveBeenCalledWith({
      trackId: "test-123",
      friendId: 1,
      embeddingType: "identity",
      model: "text-embedding-3-small",
      dims: 1536,
      embedding: EMBEDDING,
      sourceHash: "hash-1",
      identityText: "Track: x",
    });
  });

  it("honours an explicit model and dimension count", async () => {
    await storeIdentityEmbedding(
      "test-123",
      1,
      EMBEDDING,
      "hash-1",
      "Track: x",
      "text-embedding-3-large",
      3072
    );

    expect(upsertTrackEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ model: "text-embedding-3-large", dims: 3072 })
    );
  });
});

describe("needsEmbeddingUpdate", () => {
  it("returns true when no embedding exists yet", async () => {
    findEmbeddingSourceHash.mockResolvedValue(null);

    await expect(needsEmbeddingUpdate("test-123", 1, "hash-1")).resolves.toBe(true);
    expect(findEmbeddingSourceHash).toHaveBeenCalledWith("test-123", 1, "identity");
  });

  it("returns true when the stored hash differs", async () => {
    findEmbeddingSourceHash.mockResolvedValue("old-hash");

    await expect(needsEmbeddingUpdate("test-123", 1, "new-hash")).resolves.toBe(true);
  });

  it("returns false when the stored hash matches", async () => {
    findEmbeddingSourceHash.mockResolvedValue("same-hash");

    await expect(needsEmbeddingUpdate("test-123", 1, "same-hash")).resolves.toBe(false);
  });

  it("treats an empty stored hash as missing", async () => {
    findEmbeddingSourceHash.mockResolvedValue("");

    await expect(needsEmbeddingUpdate("test-123", 1, "")).resolves.toBe(true);
  });
});

describe("generateAndStoreIdentityEmbedding", () => {
  it("throws when the track does not exist", async () => {
    findTrackWithAlbumMetadata.mockResolvedValue(null);

    await expect(generateAndStoreIdentityEmbedding("missing", 4)).rejects.toThrow(
      "Track not found: missing (friend_id: 4)"
    );
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(upsertTrackEmbedding).not.toHaveBeenCalled();
  });

  it("skips work when the source hash is unchanged", async () => {
    findEmbeddingSourceHash.mockResolvedValue(hashFor(mockTrack));

    await expect(generateAndStoreIdentityEmbedding("test-123", 1)).resolves.toEqual({
      updated: false,
      reason: "Source hash unchanged",
    });
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(upsertTrackEmbedding).not.toHaveBeenCalled();
  });

  it("generates and stores when the source hash has changed", async () => {
    findEmbeddingSourceHash.mockResolvedValue("stale-hash");

    await expect(generateAndStoreIdentityEmbedding("test-123", 1)).resolves.toEqual({
      updated: true,
      reason: "Embedding generated and stored",
    });

    const expectedText = buildIdentityText(buildIdentityData(mockTrack));
    expect(createEmbedding).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: expectedText,
    });
    expect(upsertTrackEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        trackId: "test-123",
        friendId: 1,
        embeddingType: "identity",
        embedding: EMBEDDING,
        sourceHash: hashFor(mockTrack),
        identityText: expectedText,
      })
    );
  });

  it("regenerates without consulting the stored hash when forced", async () => {
    findEmbeddingSourceHash.mockResolvedValue(hashFor(mockTrack));

    await expect(
      generateAndStoreIdentityEmbedding("test-123", 1, true)
    ).resolves.toEqual({ updated: true, reason: "Embedding generated and stored" });

    expect(findEmbeddingSourceHash).not.toHaveBeenCalled();
    expect(upsertTrackEmbedding).toHaveBeenCalledTimes(1);
  });

  it("does not store anything when embedding generation fails", async () => {
    createEmbedding.mockRejectedValue(new Error("rate limited"));

    await expect(generateAndStoreIdentityEmbedding("test-123", 1)).rejects.toThrow(
      "rate limited"
    );
    expect(upsertTrackEmbedding).not.toHaveBeenCalled();
  });
});

describe("getIdentityPreview", () => {
  it("returns the identity text and data without writing anything", async () => {
    const result = await getIdentityPreview("test-123", 1);

    expect(result.identityData).toEqual(buildIdentityData(mockTrack));
    expect(result.identityText).toBe(buildIdentityText(buildIdentityData(mockTrack)));
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(upsertTrackEmbedding).not.toHaveBeenCalled();
  });

  it("throws when the track does not exist", async () => {
    findTrackWithAlbumMetadata.mockResolvedValue(null);

    await expect(getIdentityPreview("missing", 7)).rejects.toThrow(
      "Track not found: missing (friend_id: 7)"
    );
  });

  it("previews exactly the text the pipeline embeds", async () => {
    const preview = await getIdentityPreview("test-123", 1);
    await generateAndStoreIdentityEmbedding("test-123", 1);
    const embedded = createEmbedding.mock.calls[0][0].input as string;

    expect(preview.identityText).toBe(embedded);
  });
});
