import { describe, it, expect } from "vitest";
import { retrieveCandidates, hasEmbeddings } from "../recommendation-candidate-retriever";

// DB integration tests — only run when RUN_DB_TESTS=1
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");

// Replace with real track IDs from your database before running DB tests
const SEED_TRACK_ID = "test-track-1";
const SEED_FRIEND_ID = 1;

describe("RecommendationCandidateRetriever (DB integration)", () => {
  dbTest("deduplicates union of identity and audio results", async () => {
    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 50,
      limitAudio: 50,
    });

    expect(result.stats.unionCount).toBeLessThanOrEqual(
      result.stats.identityCount + result.stats.audioCount
    );

    // No duplicate track keys
    const keys = new Set<string>();
    for (const c of result.candidates) {
      const key = `${c.trackId}:${c.friendId}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  dbTest("gracefully handles missing embeddings", async () => {
    const embeddings = await hasEmbeddings(SEED_TRACK_ID, SEED_FRIEND_ID);

    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 50,
      limitAudio: 50,
    });

    if (!embeddings.identity) {
      expect(result.stats.identityCount).toBe(0);
    }
    if (!embeddings.audio) {
      expect(result.stats.audioCount).toBe(0);
    }
    if (embeddings.identity || embeddings.audio) {
      expect(result.stats.unionCount).toBeGreaterThan(0);
    }
  });

  dbTest("excludes the seed track from results", async () => {
    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 100,
      limitAudio: 100,
    });

    const seedInResults = result.candidates.some(
      (c) => c.trackId === SEED_TRACK_ID && c.friendId === SEED_FRIEND_ID
    );
    expect(seedInResults).toBe(false);
  });

  dbTest("similarity scores are in [0, 1]", async () => {
    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 100,
      limitAudio: 100,
    });

    for (const c of result.candidates) {
      if (c.simIdentity !== null) {
        expect(c.simIdentity).toBeGreaterThanOrEqual(0);
        expect(c.simIdentity).toBeLessThanOrEqual(1);
      }
      if (c.simAudio !== null) {
        expect(c.simAudio).toBeGreaterThanOrEqual(0);
        expect(c.simAudio).toBeLessThanOrEqual(1);
      }
      expect(c.simIdentity !== null || c.simAudio !== null).toBe(true);
    }
  });

  dbTest("all candidates have required metadata fields", async () => {
    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 20,
      limitAudio: 20,
    });

    for (const c of result.candidates) {
      expect(typeof c.metadata.title).toBe("string");
      expect(typeof c.metadata.artist).toBe("string");
      expect(typeof c.metadata.album).toBe("string");
      expect(Array.isArray(c.metadata.tags)).toBe(true);
      expect(Array.isArray(c.metadata.genreRefs)).toBe(true);
      expect(Array.isArray(c.metadata.styles)).toBe(true);
      expect(Array.isArray(c.metadata.genres)).toBe(true);
      if (c.metadata.bpm !== null) {
        expect(typeof c.metadata.bpm).toBe("number");
      }
    }
  });

  dbTest("records timing stats", async () => {
    const result = await retrieveCandidates(SEED_TRACK_ID, SEED_FRIEND_ID, {
      limitIdentity: 100,
      limitAudio: 100,
    });

    const { timingMs } = result.stats;
    expect(timingMs.identityQuery).toBeGreaterThanOrEqual(0);
    expect(timingMs.audioQuery).toBeGreaterThanOrEqual(0);
    expect(timingMs.total).toBeGreaterThanOrEqual(timingMs.identityQuery);
    expect(timingMs.total).toBeGreaterThanOrEqual(timingMs.audioQuery);
  });
});
