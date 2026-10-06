import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingJob } from "@/types/embeddingQueue";

const mock = vi.hoisted(() => ({
  fetchTrack: vi.fn(), buildIdentityData: vi.fn(), buildIdentityText: vi.fn(),
  computeSourceHash: vi.fn(), needsIdentity: vi.fn(), storeIdentity: vi.fn(),
  buildContextText: vi.fn(), needsContext: vi.fn(),
  findAudioTrack: vi.fn(), hasAudioData: vi.fn(), buildAudioVibeData: vi.fn(),
  buildAudioVibeText: vi.fn(), computeAudioVibeHash: vi.fn(), needsAudioVibe: vi.fn(),
  storeAudioVibe: vi.fn(), getProvider: vi.fn(), upsert: vi.fn(), embed: vi.fn(),
}));

vi.mock("@/lib/identity-embedding", () => ({
  fetchTrackWithAlbum: mock.fetchTrack, buildIdentityData: mock.buildIdentityData,
  buildIdentityText: mock.buildIdentityText, computeSourceHash: mock.computeSourceHash,
  needsEmbeddingUpdate: mock.needsIdentity, storeIdentityEmbedding: mock.storeIdentity,
}));
vi.mock("@/lib/context-embedding", () => ({
  buildContextText: mock.buildContextText, needsContextUpdate: mock.needsContext,
}));
vi.mock("@/lib/audio-vibe-embedding", () => ({
  buildAudioVibeData: mock.buildAudioVibeData, buildAudioVibeText: mock.buildAudioVibeText,
  computeAudioVibeHash: mock.computeAudioVibeHash, hasAudioData: mock.hasAudioData,
  needsAudioVibeUpdate: mock.needsAudioVibe, storeAudioVibeEmbedding: mock.storeAudioVibe,
}));
vi.mock("@/lib/embeddings/config", () => ({ getTargetProvider: mock.getProvider }));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackByTrackIdAndFriendIdRaw: mock.findAudioTrack },
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { upsertTrackEmbedding: mock.upsert },
}));

import { runEmbeddingBatch } from "../embeddingBatchService";

const job = (track_id: string, kind: EmbeddingJob["kind"] = "identity", force = false): EmbeddingJob =>
  ({ track_id, friend_id: 1, kind, force });

beforeEach(() => {
  vi.resetAllMocks();
  mock.fetchTrack.mockImplementation(async (id: string) => ({ id }));
  mock.findAudioTrack.mockImplementation(async (id: string) => ({ id }));
  mock.buildIdentityData.mockImplementation((track: { id: string }) => track);
  mock.buildAudioVibeData.mockImplementation((track: { id: string }) => track);
  mock.buildIdentityText.mockImplementation((data: { id: string }) => `identity:${data.id}`);
  mock.buildContextText.mockImplementation((data: { id: string }) => `context:${data.id}`);
  mock.buildAudioVibeText.mockImplementation((data: { id: string }) => `audio:${data.id}`);
  mock.computeSourceHash.mockImplementation((data: { id: string }) => `hash:${data.id}`);
  mock.computeAudioVibeHash.mockImplementation((data: { id: string }) => `hash:${data.id}`);
  mock.needsIdentity.mockResolvedValue(true);
  mock.needsContext.mockResolvedValue(true);
  mock.needsAudioVibe.mockResolvedValue(true);
  mock.hasAudioData.mockReturnValue(true);
  mock.embed.mockImplementation(async (texts: string[]) => texts.map((_, i) => [i]));
  mock.getProvider.mockResolvedValue({ model: "m1", dims: 2, embed: mock.embed });
  mock.storeIdentity.mockResolvedValue(undefined);
  mock.storeAudioVibe.mockResolvedValue(undefined);
  mock.upsert.mockResolvedValue(undefined);
});

describe("runEmbeddingBatch", () => {
  it("groups by kind, embeds each text once, and maps vectors to the right tracks", async () => {
    const results = await runEmbeddingBatch([
      job("a"), job("b", "context"), job("c"), job("d", "audio_vibe"),
    ]);
    expect(results).toEqual(Array.from({ length: 4 }, () => ({ updated: true })));
    expect(mock.embed.mock.calls.map(([texts]) => texts)).toEqual([
      ["identity:a", "identity:c"], ["context:b"], ["audio:d"],
    ]);
    expect(mock.storeIdentity).toHaveBeenCalledWith("c", 1, [1], "hash:c", "identity:c", "m1", 2);
    expect(mock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      trackId: "b", embeddingType: "context", embedding: [0], sourceHash: "hash:b",
    }));
    expect(mock.storeAudioVibe).toHaveBeenCalledWith("d", 1, [0], "hash:d", "audio:d", "m1", 2);
  });

  it("keeps different target models in separate provider calls", async () => {
    mock.getProvider
      .mockResolvedValueOnce({ model: "m1", dims: 2, embed: mock.embed })
      .mockResolvedValueOnce({ model: "m2", dims: 2, embed: mock.embed });
    expect(await runEmbeddingBatch([job("a"), job("b")]))
      .toEqual([{ updated: true }, { updated: true }]);
    expect(mock.embed.mock.calls.map(([texts]) => texts)).toEqual([["identity:a"], ["identity:b"]]);
    expect(mock.storeIdentity.mock.calls.map((call) => call[5])).toEqual(["m1", "m2"]);
  });

  it("skips unchanged or audio-less tracks and honors force", async () => {
    mock.needsIdentity.mockResolvedValue(false);
    mock.hasAudioData.mockReturnValue(false);
    expect(await runEmbeddingBatch([job("a"), job("b", "audio_vibe"), job("c", "identity", true)]))
      .toEqual([{ updated: false }, { updated: false }, { updated: true }]);
    expect(mock.needsIdentity).toHaveBeenCalledTimes(1);
    expect(mock.embed).toHaveBeenCalledWith(["identity:c"]);
  });

  it("handles missing and unchanged audio tracks independently", async () => {
    mock.findAudioTrack.mockImplementation(async (id: string) => id === "missing" ? null : { id });
    mock.needsAudioVibe.mockResolvedValue(false);
    const results = await runEmbeddingBatch([
      job("missing", "audio_vibe"), job("unchanged", "audio_vibe"),
      job("forced", "audio_vibe", true),
    ]);
    expect(results[0].error).toEqual(new Error("Track not found: missing (friend_id: 1)"));
    expect(results[1]).toEqual({ updated: false });
    expect(results[2]).toEqual({ updated: true });
    expect(mock.embed).toHaveBeenCalledWith(["audio:forced"]);
  });

  it("keeps preparation and storage errors per job", async () => {
    mock.fetchTrack.mockImplementation(async (id: string) => id === "missing" ? null : { id });
    mock.storeIdentity.mockImplementation(async (id: string) => {
      if (id === "bad-store") throw new Error("db down");
    });
    const results = await runEmbeddingBatch([job("missing"), job("good"), job("bad-store")]);
    expect(results[0].error).toEqual(new Error("Track not found: missing (friend_id: 1)"));
    expect(results[1]).toEqual({ updated: true });
    expect(results[2].error).toEqual(new Error("db down"));
  });

  it("retries every job on a 429 without sending individual requests", async () => {
    mock.embed.mockRejectedValue(new Error("429 Too Many Requests"));
    const results = await runEmbeddingBatch([job("a"), job("b")]);
    expect(results.every((result) => result.error instanceof Error)).toBe(true);
    expect(mock.embed).toHaveBeenCalledTimes(1);
  });

  it("isolates a rejected input after a 400 batch response", async () => {
    mock.embed.mockImplementation(async (texts: string[]) => {
      if (texts.length > 1 || texts[0] === "identity:bad") throw Object.assign(new Error("bad input"), { status: 400 });
      return [[1]];
    });
    const results = await runEmbeddingBatch([job("good"), job("bad")]);
    expect(results[0]).toEqual({ updated: true });
    expect(results[1].error).toEqual(expect.objectContaining({ message: "bad input" }));
    expect(mock.embed).toHaveBeenCalledTimes(3);
  });

  it("retries a single input when isolation returns no vector", async () => {
    mock.embed.mockImplementation(async (texts: string[]) => {
      if (texts.length > 1) throw Object.assign(new Error("bad batch"), { status: 400 });
      return texts[0] === "identity:a" ? [] : [[1]];
    });
    const results = await runEmbeddingBatch([job("a"), job("b")]);
    expect(results[0].error).toEqual(new Error("Embedding provider returned no vector"));
    expect(results[1]).toEqual({ updated: true });
  });

  it("stops input isolation if the provider reports an auth failure", async () => {
    mock.embed.mockImplementation(async (texts: string[]) => {
      if (texts.length > 1) throw Object.assign(new Error("bad batch"), { status: 400 });
      throw "401 Unauthorized";
    });
    const results = await runEmbeddingBatch([job("a"), job("b")]);
    expect(results).toEqual([
      { updated: false, error: "401 Unauthorized" },
      { updated: false, pending: true },
    ]);
    expect(mock.embed).toHaveBeenCalledTimes(2);
  });

  it("leaves later groups pending after an auth failure", async () => {
    mock.embed.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const results = await runEmbeddingBatch([job("a"), job("b", "context")]);
    expect(results[0].error).toEqual(new Error("401 Unauthorized"));
    expect(results[1]).toEqual({ updated: false, pending: true });
    expect(mock.embed).toHaveBeenCalledTimes(1);
  });

  it("drops a legacy prompt job without a provider call", async () => {
    expect(await runEmbeddingBatch([job("old", "prompt" as EmbeddingJob["kind"])]))
      .toEqual([{ updated: false }]);
    expect(mock.embed).not.toHaveBeenCalled();
  });

  it("retries a group if the provider returns fewer vectors than inputs", async () => {
    mock.embed.mockResolvedValue([[1]]);
    const results = await runEmbeddingBatch([job("a"), job("b")]);
    expect(results.map((result) => result.error)).toEqual([
      new Error("Embedding provider returned 1 vectors for 2 inputs"),
      new Error("Embedding provider returned 1 vectors for 2 inputs"),
    ]);
    expect(mock.storeIdentity).not.toHaveBeenCalled();
  });
});
