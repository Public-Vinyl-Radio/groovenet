import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationRepository } from "../recommendationRepository";

const mockClient = vi.hoisted(() => ({ query: vi.fn() }));
const withDbClient = vi.hoisted(() =>
  vi.fn((fn: (client: typeof mockClient) => unknown) => fn(mockClient))
);

vi.mock("@/lib/serverDb", () => ({ withDbClient }));

beforeEach(() => {
  vi.resetAllMocks();
  withDbClient.mockImplementation((fn: (client: typeof mockClient) => unknown) => fn(mockClient));
});

function makeRepo() {
  return new RecommendationRepository();
}

const PROBE_ROW = { rows: [] };
const EMPTY_EMBEDDING = { rows: [] };

function mockWithEmbedding(embedding: unknown, resultRows: unknown[]) {
  mockClient.query
    .mockResolvedValueOnce(PROBE_ROW) // set_config
    .mockResolvedValueOnce({ rows: [{ embedding }] }) // embedding lookup
    .mockResolvedValueOnce({ rows: resultRows }); // similarity query
}

function mockWithNoEmbedding() {
  mockClient.query
    .mockResolvedValueOnce(PROBE_ROW) // set_config
    .mockResolvedValueOnce(EMPTY_EMBEDDING); // embedding lookup - not found
}

// ─── findIdentitySimilar ──────────────────────────────────────────────────────

const MODEL = "text-embedding-3-small";
const DIMS = 1536;

describe("findIdentitySimilar()", () => {
  it("returns empty array when no embedding is found for the seed track", async () => {
    mockWithNoEmbedding();

    const result = await makeRepo().findIdentitySimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result).toEqual([]);
  });

  it("sets ivfflat.probes before querying", async () => {
    mockWithEmbedding([0.1], []);

    await makeRepo().findIdentitySimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 4,
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("set_config"),
      ["4"]
    );
  });

  it("coerces distance from string to number", async () => {
    mockWithEmbedding([0.1], [
      { track_id: "t2", friend_id: 1, distance: "0.25", title: "Track", artist: "Artist",
        album: "Album", year: null, bpm: null, key: null, genres: [], styles: [],
        local_tags: "", danceability: null, mood_happy: null, mood_sad: null,
        mood_relaxed: null, mood_aggressive: null, star_rating: null, album_thumbnail: null },
    ]);

    const result = await makeRepo().findIdentitySimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result[0].distance).toBe(0.25);
    expect(typeof result[0].distance).toBe("number");
  });

  it("queries with the correct embedding type, model and params", async () => {
    const embedding = [0.5, 0.6];
    mockWithEmbedding(embedding, []);

    await makeRepo().findIdentitySimilar({
      seedTrackId: "t1",
      seedFriendId: 2,
      model: MODEL,
      dims: DIMS,
      limit: 5,
      ivfflatProbes: 1,
    });

    // Embedding lookup must filter by 'identity' and model
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("identity"),
      ["t1", 2, MODEL]
    );

    // Similarity query receives the embedding, limit and model
    const [sql, params] = mockClient.query.mock.calls[2];
    expect(sql).toContain("te.model = $5");
    expect(params[0]).toEqual(embedding);
    expect(params[3]).toBe(5);
    expect(params[4]).toBe(MODEL);
  });
});

// ─── findAudioSimilar ─────────────────────────────────────────────────────────

describe("findAudioSimilar()", () => {
  it("returns empty array when no embedding is found", async () => {
    mockWithNoEmbedding();

    const result = await makeRepo().findAudioSimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result).toEqual([]);
  });

  it("coerces distance from string to number", async () => {
    mockWithEmbedding([0.3], [
      { track_id: "t2", friend_id: 1, distance: "0.88", title: "T", artist: "A",
        album: "B", year: null, bpm: 128, key: "Am", genres: [], styles: [],
        local_tags: "", danceability: 0.9, mood_happy: 0.5, mood_sad: 0.1,
        mood_relaxed: 0.3, mood_aggressive: 0.2, star_rating: 4, album_thumbnail: null },
    ]);

    const result = await makeRepo().findAudioSimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result[0].distance).toBe(0.88);
    expect(typeof result[0].distance).toBe("number");
  });

  it("queries with audio_vibe embedding type and model", async () => {
    mockWithEmbedding([0.1], []);

    await makeRepo().findAudioSimilar({
      seedTrackId: "t1",
      seedFriendId: 1,
      model: MODEL,
      dims: DIMS,
      limit: 5,
      ivfflatProbes: 2,
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("audio_vibe"),
      ["t1", 1, MODEL]
    );
  });
});

// ─── findIdentitySimilarByCentroid ────────────────────────────────────────────

describe("findIdentitySimilarByCentroid()", () => {
  it("returns empty array without querying when seedTracks is empty", async () => {
    const result = await makeRepo().findIdentitySimilarByCentroid({
      seedTracks: [],
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result).toEqual([]);
    expect(withDbClient).not.toHaveBeenCalled();
  });

  it("sets ivfflat.probes and queries with the correct seed params", async () => {
    mockClient.query
      .mockResolvedValueOnce(PROBE_ROW) // set_config
      .mockResolvedValueOnce({ rows: [] }); // similarity query

    await makeRepo().findIdentitySimilarByCentroid({
      seedTracks: [
        { trackId: "t1", friendId: 1 },
        { trackId: "t2", friendId: 2 },
      ],
      model: MODEL,
      dims: DIMS,
      limit: 5,
      ivfflatProbes: 3,
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("set_config"),
      ["3"]
    );

    const [sql, params] = mockClient.query.mock.calls[1];
    expect(sql).toContain("identity");
    expect(params).toContain("t1");
    expect(params).toContain("t2");
    expect(params).toContain(5);
    expect(params).toContain(MODEL);
  });

  it("builds seed values with the correct $N placeholders", async () => {
    mockClient.query
      .mockResolvedValueOnce(PROBE_ROW)
      .mockResolvedValueOnce({ rows: [] });

    await makeRepo().findIdentitySimilarByCentroid({
      seedTracks: [
        { trackId: "tA", friendId: 10 },
        { trackId: "tB", friendId: 20 },
      ],
      model: MODEL,
      dims: DIMS,
      limit: 3,
      ivfflatProbes: 1,
    });

    const [sql] = mockClient.query.mock.calls[1];
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(sql).toContain("$4");
    // limit is $5, model is $6
    expect(sql).toContain("$5");
    expect(sql).toContain("$6");
  });

  it("coerces distance from string to number", async () => {
    mockClient.query
      .mockResolvedValueOnce(PROBE_ROW)
      .mockResolvedValueOnce({
        rows: [{ track_id: "t3", friend_id: 1, distance: "0.33", title: "T", artist: "A",
          album: "B", year: null, bpm: null, key: null, genres: [], styles: [],
          local_tags: "", danceability: null, mood_happy: null, mood_sad: null,
          mood_relaxed: null, mood_aggressive: null, star_rating: null, album_thumbnail: null }],
      });

    const result = await makeRepo().findIdentitySimilarByCentroid({
      seedTracks: [{ trackId: "t1", friendId: 1 }],
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result[0].distance).toBe(0.33);
  });
});

// ─── findAudioSimilarByCentroid ───────────────────────────────────────────────

describe("findAudioSimilarByCentroid()", () => {
  it("returns empty array without querying when seedTracks is empty", async () => {
    const result = await makeRepo().findAudioSimilarByCentroid({
      seedTracks: [],
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result).toEqual([]);
    expect(withDbClient).not.toHaveBeenCalled();
  });

  it("queries with audio_vibe embedding type and model", async () => {
    mockClient.query
      .mockResolvedValueOnce(PROBE_ROW)
      .mockResolvedValueOnce({ rows: [] });

    await makeRepo().findAudioSimilarByCentroid({
      seedTracks: [{ trackId: "t1", friendId: 1 }],
      model: MODEL,
      dims: DIMS,
      limit: 5,
      ivfflatProbes: 1,
    });

    const [sql, params] = mockClient.query.mock.calls[1];
    expect(sql).toContain("audio_vibe");
    expect(params).toContain(MODEL);
  });

  it("coerces distance from string to number", async () => {
    mockClient.query
      .mockResolvedValueOnce(PROBE_ROW)
      .mockResolvedValueOnce({
        rows: [{ track_id: "t2", friend_id: 1, distance: "0.77", title: "T", artist: "A",
          album: "B", year: null, bpm: null, key: null, genres: [], styles: [],
          local_tags: "", danceability: null, mood_happy: null, mood_sad: null,
          mood_relaxed: null, mood_aggressive: null, star_rating: null, album_thumbnail: null }],
      });

    const result = await makeRepo().findAudioSimilarByCentroid({
      seedTracks: [{ trackId: "t1", friendId: 1 }],
      model: MODEL,
      dims: DIMS,
      limit: 10,
      ivfflatProbes: 1,
    });

    expect(result[0].distance).toBe(0.77);
  });
});
