import { beforeEach, describe, it, expect, vi } from "vitest";

const { embed, findTrackWithAlbumMetadata, upsertTrackEmbedding, findEmbeddingSourceHash } =
  vi.hoisted(() => ({
    embed: vi.fn(),
    findTrackWithAlbumMetadata: vi.fn(),
    upsertTrackEmbedding: vi.fn(),
    findEmbeddingSourceHash: vi.fn(),
  }));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackWithAlbumMetadata },
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { upsertTrackEmbedding, findEmbeddingSourceHash },
}));
vi.mock("@/lib/embeddings/config", () => ({
  getTargetProvider: vi.fn(async () => ({ model: "context-model", dims: 3, embed })),
  getTargetModel: vi.fn(async () => ({ model: "context-model", dims: 3 })),
}));

import {
  buildContextText,
  CONTEXT_TEMPLATE_VERSION,
  generateAndStoreContextEmbedding,
  getContextPreview,
  needsContextUpdate,
} from "../context-embedding";
import { buildIdentityData, computeSourceHash, type IdentityData } from "../identity-embedding";
import type { Track } from "@/types/track";

const track = {
  track_id: "t1",
  friend_id: 6,
  title: "Song",
  artist: "Artist",
  album: "Album",
  year: 1974,
  local_tags: "Cumbia Amazónica, Trip-hop, warm-up",
  album_country: "Peru",
  album_label: "Infopesa, Discos Fuentes",
  album_genres: ["Latin", "Folk, World, & Country"],
  album_styles: ["Cumbia", "Chicha"],
} as unknown as Track;

const data = (overrides: Partial<IdentityData>): IdentityData => ({
  ...buildIdentityData(track),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
  findTrackWithAlbumMetadata.mockResolvedValue(track);
  upsertTrackEmbedding.mockResolvedValue(undefined);
  findEmbeddingSourceHash.mockResolvedValue(null);
});

describe("buildContextText", () => {
  it("leads with descriptors, then genres and era, then the identifiers", () => {
    // The #382 "F" text for the same track (evaluations/382/variants.test.mjs).
    expect(buildContextText(buildIdentityData(track))).toBe(
      [
        "chicha, cumbia, cumbia amazonica, trip hop. folk world and country, latin music from the 1970s.",
        "Track: Song — Artist",
        "Release: Album",
        "Labels: discos fuentes, infopesa",
      ].join("\n")
    );
  });

  it("leaves out release country and DJ-function tags", () => {
    const text = buildContextText(buildIdentityData(track));
    expect(text).not.toContain("peru");
    expect(text).not.toContain("warm");
  });

  it("degrades gracefully without descriptors, genres, era or labels", () => {
    const text = buildContextText(
      data({ styles: [], tags: [], genres: [], era: "unknown-era", labels: [] })
    );
    expect(text.split("\n")[0]).toBe("music.");
    expect(text).toContain("Labels: none");
  });

  it("lists a descriptor that is both a style and a tag once", () => {
    const text = buildContextText(data({ styles: ["salsa"], tags: ["salsa"] }));
    expect(text.startsWith("salsa. ")).toBe(true);
  });
});

describe("needsContextUpdate", () => {
  it("looks the hash up at the target model and current template", async () => {
    await expect(needsContextUpdate("t1", 6, "h")).resolves.toBe(true);
    expect(findEmbeddingSourceHash).toHaveBeenCalledWith(
      "t1",
      6,
      "context",
      "context-model",
      CONTEXT_TEMPLATE_VERSION
    );
  });

  it("is false only when the stored hash matches", async () => {
    findEmbeddingSourceHash.mockResolvedValue("same");
    await expect(needsContextUpdate("t1", 6, "same")).resolves.toBe(false);
    await expect(needsContextUpdate("t1", 6, "other")).resolves.toBe(true);
  });
});

describe("generateAndStoreContextEmbedding", () => {
  it("embeds the context text and stores it as a context row", async () => {
    const result = await generateAndStoreContextEmbedding("t1", 6);

    expect(result.updated).toBe(true);
    const text = buildContextText(buildIdentityData(track));
    expect(embed).toHaveBeenCalledWith([text]);
    expect(upsertTrackEmbedding).toHaveBeenCalledWith({
      trackId: "t1",
      friendId: 6,
      embeddingType: "context",
      model: "context-model",
      dims: 3,
      embedding: [0.1, 0.2, 0.3],
      sourceHash: computeSourceHash(buildIdentityData(track)),
      identityText: text,
      templateVersion: CONTEXT_TEMPLATE_VERSION,
    });
  });

  it("skips a track whose hash is unchanged unless forced", async () => {
    findEmbeddingSourceHash.mockResolvedValue(computeSourceHash(buildIdentityData(track)));

    await expect(generateAndStoreContextEmbedding("t1", 6)).resolves.toEqual({
      updated: false,
      reason: "Source hash unchanged",
    });
    expect(embed).not.toHaveBeenCalled();

    await expect(generateAndStoreContextEmbedding("t1", 6, true)).resolves.toMatchObject({
      updated: true,
    });
    expect(findEmbeddingSourceHash).toHaveBeenCalledTimes(1);
  });

  it("throws for a missing track without embedding anything", async () => {
    findTrackWithAlbumMetadata.mockResolvedValue(null);

    await expect(generateAndStoreContextEmbedding("gone", 6)).rejects.toThrow(
      "Track not found: gone (friend_id: 6)"
    );
    expect(embed).not.toHaveBeenCalled();
  });
});

describe("getContextPreview", () => {
  it("previews exactly the text the pipeline embeds", async () => {
    const preview = await getContextPreview("t1", 6);

    expect(preview.contextText).toBe(buildContextText(buildIdentityData(track)));
    expect(preview.contextData.tags).toEqual(["cumbia amazonica", "trip hop"]);
  });

  it("throws for a missing track", async () => {
    findTrackWithAlbumMetadata.mockResolvedValue(null);
    await expect(getContextPreview("gone", 6)).rejects.toThrow("Track not found");
  });
});
