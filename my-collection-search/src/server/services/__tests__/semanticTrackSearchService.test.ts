import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ query: vi.fn() }));
const findContextMatches = vi.hoisted(() => vi.fn());
const embedSearchQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({
  withDbTransaction: (fn: (c: typeof client) => unknown) => fn(client),
}));
vi.mock("@/lib/embeddings/config", () => ({
  getServingModel: vi.fn(async () => ({ model: "m", dims: 3, templateVersion: 2 })),
}));
vi.mock("@/server/repositories/embeddingsRepository", () => ({
  embeddingsRepository: { findContextMatches },
}));
vi.mock("@/server/services/queryEmbeddingService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queryEmbeddingService")>()),
  embedSearchQuery,
}));

import {
  CONTEXT_IVFFLAT_PROBES,
  PER_RELEASE_CAP,
  fuseHybridResults,
  isKnownItemMatch,
  semanticTrackSearch,
  type TrackRow,
} from "../semanticTrackSearchService";
import type { TrackMissingFilter } from "@/lib/trackFilterSpec";

const row = (track_id: string, extra: Record<string, unknown> = {}): TrackRow => ({
  track_id,
  friend_id: 1,
  release_id: `r-${track_id}`,
  ...extra,
});

beforeEach(() => {
  client.query.mockReset();
  findContextMatches.mockReset();
  embedSearchQuery.mockReset().mockResolvedValue({ embedding: [1, 0, 0], cacheHit: true });
});

describe("semanticTrackSearch", () => {
  const params = { q: "dusty cumbia", limit: 5, friendId: 1, missing: [] as TrackMissingFilter[], caller: "c" };

  it("embeds with the serving model and scans inside a tuned transaction", async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({
        // Hydration comes back in table order, not distance order.
        rows: [row("b", { title: "B" }), row("a", { title: "A" })],
      });
    findContextMatches.mockResolvedValue([
      { track_id: "a", friend_id: 1 },
      { track_id: "b", friend_id: 1 },
      { track_id: "gone", friend_id: 1 },
    ]);

    const result = await semanticTrackSearch({
      ...params,
      missing: ["local_audio"],
      attributes: { bpmMin: 90, key: "A minor" },
    });

    expect(embedSearchQuery).toHaveBeenCalledWith({
      query: "dusty cumbia",
      model: "m",
      dims: 3,
      caller: "c",
    });
    const [setSql, setParams] = client.query.mock.calls[0];
    expect(setSql).toContain("set_config('ivfflat.probes', $1, true)");
    expect(setSql).toContain("set_config('ivfflat.iterative_scan', 'relaxed_order', true)");
    expect(setParams).toEqual([String(CONTEXT_IVFFLAT_PROBES)]);
    expect(findContextMatches).toHaveBeenCalledWith(client, {
      queryEmbedding: [1, 0, 0],
      model: "m",
      templateVersion: 2,
      dims: 3,
      limit: 5,
      perReleaseCap: PER_RELEASE_CAP,
      filters: { bpmMin: 90, key: "A minor", friendId: 1, missing: ["local_audio"] },
    });
    const [hydrateSql, hydrateParams] = client.query.mock.calls[1];
    expect(hydrateSql).toContain('AS "hasVectors"');
    expect(hydrateSql).toContain("t.deleted_at IS NULL");
    expect(hydrateParams).toEqual([["a", "b", "gone"], [1, 1, 1]]);
    // Distance order, and a match whose row vanished is dropped.
    expect(result.hits.map((h) => h.track_id)).toEqual(["a", "b"]);
    expect(result.cacheHit).toBe(true);
    expect(result.embedMs).toBeGreaterThanOrEqual(0);
    expect(result.vectorMs).toBeGreaterThanOrEqual(0);
  });

  it("skips hydration when nothing matches", async () => {
    client.query.mockResolvedValue({ rows: [] });
    findContextMatches.mockResolvedValue([]);

    const result = await semanticTrackSearch(params);

    expect(result.hits).toEqual([]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});

describe("isKnownItemMatch", () => {
  const track = { title: "Cumbia Sampuesana", artist: "Los Corraleros", album: "Bailables" };

  it.each([
    "cumbia sampuesana",
    "LOS  corraleros",
    "bailables",
    "los corraleros cumbia sampuesana",
    "cumbia sampuesana los corraleros",
    "los corraleros - cumbia sampuesana",
  ])("matches %j", (q) => {
    expect(isKnownItemMatch(track, q)).toBe(true);
  });

  it("doesn't match a partial query, an empty one or a missing field", () => {
    expect(isKnownItemMatch(track, "cumbia")).toBe(false);
    expect(isKnownItemMatch(track, "   ")).toBe(false);
    expect(isKnownItemMatch({ title: null, artist: 3 }, "3")).toBe(false);
  });
});

describe("fuseHybridResults", () => {
  it("ranks by reciprocal rank, rewarding agreement between the lists", () => {
    const fused = fuseHybridResults({
      q: "warm brass",
      lexical: [row("l1"), row("both")],
      semantic: [row("s1"), row("both")],
      limit: 10,
    });
    // `both` is second in each list (2/62) and beats either first place (1/61).
    expect(fused.map((r) => r.track_id)).toEqual(["both", "l1", "s1"]);
  });

  it("keeps lexical order on a tie and respects the limit", () => {
    const fused = fuseHybridResults({
      q: "x",
      lexical: [row("l1"), row("l2")],
      semantic: [row("s1"), row("s2")],
      limit: 3,
    });
    expect(fused.map((r) => r.track_id)).toEqual(["l1", "s1", "l2"]);
  });

  it("puts known-item matches first, in lexical order", () => {
    const fused = fuseHybridResults({
      q: "Fela Kuti",
      lexical: [row("other"), row("k1", { artist: "Fela Kuti" }), row("k2", { artist: "fela kuti" })],
      semantic: [row("k2", { artist: "fela kuti" }), row("vibe")],
      limit: 10,
    });
    expect(fused.map((r) => r.track_id)).toEqual(["k1", "k2", "other", "vibe"]);
  });

  it("caps the fused tail per release, but never the known items", () => {
    const sameRelease = (id: string, extra: Record<string, unknown> = {}) =>
      row(id, { release_id: "r1", ...extra });
    const fused = fuseHybridResults({
      q: "the album",
      lexical: [
        sameRelease("a1", { album: "The Album" }),
        sameRelease("a2", { album: "The Album" }),
        sameRelease("a3", { album: "The Album" }),
        sameRelease("x1"),
        sameRelease("x2"),
        sameRelease("x3"),
        sameRelease("x4"),
        row("solo", { release_id: null }),
      ],
      semantic: [],
      limit: 10,
    });
    expect(fused.map((r) => r.track_id)).toEqual(["a1", "a2", "a3", "x1", "x2", "x3", "solo"]);
  });

  it("caps at three per release, the setting #424 chose", () => {
    expect(PER_RELEASE_CAP).toBe(3);
  });

  it("treats the same track id under two friends as two tracks", () => {
    const fused = fuseHybridResults({
      q: "x",
      lexical: [row("t", { friend_id: 1 })],
      semantic: [row("t", { friend_id: 2, release_id: "other" })],
      limit: 10,
    });
    expect(fused).toHaveLength(2);
  });
});
