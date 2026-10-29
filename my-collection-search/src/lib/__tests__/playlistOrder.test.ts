import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  camelotDistance,
  transitionPenalty,
  buildCompatibilityGraph,
  greedyPath,
  keyToCamelot,
} from "../playlistOrder";
import type { TrackWithCamelot } from "../playlistOrder";

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns correct value for a known non-trivial pair", () => {
    // [1,1] · [1,-1] = 0 => orthogonal
    expect(cosineSimilarity([1, 1], [1, -1])).toBeCloseTo(0);
  });

  it("is symmetric", () => {
    const a = [0.3, 0.7, 0.1];
    const b = [0.9, 0.2, 0.5];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });
});

// ─── camelotDistance ──────────────────────────────────────────────────────────

describe("camelotDistance", () => {
  it("returns 0 for identical camelot keys", () => {
    expect(camelotDistance("8B", "8B")).toBe(0);
    expect(camelotDistance("1A", "1A")).toBe(0);
  });

  it("returns circular distance for same mode (wrap-around)", () => {
    // 12B → 1B: distance 1 (wraps around)
    expect(camelotDistance("12B", "1B")).toBe(1);
    expect(camelotDistance("1B", "12B")).toBe(1);
  });

  it("returns straight distance for same mode (no wrap needed)", () => {
    expect(camelotDistance("3A", "5A")).toBe(2);
    expect(camelotDistance("6B", "9B")).toBe(3);
  });

  it("returns 1 for same number different mode", () => {
    expect(camelotDistance("8A", "8B")).toBe(1);
    expect(camelotDistance("12A", "12B")).toBe(1);
  });

  it("returns 2 for different number different mode", () => {
    expect(camelotDistance("3A", "5B")).toBe(2);
  });

  it("returns 6 when either key is empty string", () => {
    expect(camelotDistance("", "8B")).toBe(6);
    expect(camelotDistance("8B", "")).toBe(6);
  });

  it("returns 6 when either key is unparseable", () => {
    expect(camelotDistance("C major", "8B")).toBe(6);
    expect(camelotDistance("8B", "not-a-key")).toBe(6);
  });

  it("is case-insensitive for mode suffix", () => {
    expect(camelotDistance("8a", "8a")).toBe(0);
    expect(camelotDistance("8a", "8A")).toBe(0);
  });

  it("uses minimum circular distance (max distance is 6)", () => {
    // 1B and 7B: straight = 6, wrap = 6 → both are 6
    expect(camelotDistance("1B", "7B")).toBe(6);
    // 1B and 8B: straight = 7, wrap = 5 → returns 5
    expect(camelotDistance("1B", "8B")).toBe(5);
  });
});

// ─── transitionPenalty ────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<TrackWithCamelot>): TrackWithCamelot {
  return { bpm: 0, energy: 0, idx: 0, ...overrides };
}

describe("transitionPenalty", () => {
  it("returns 0 for identical tracks (same key, bpm, energy)", () => {
    const t = makeTrack({ bpm: 120, energy: 0.5, camelot_key: "8A" });
    expect(transitionPenalty(t, t)).toBe(0);
  });

  it("applies bpm coefficient of 0.1", () => {
    const a = makeTrack({ bpm: 100, energy: 0, camelot_key: "8A" });
    const b = makeTrack({ bpm: 110, energy: 0, camelot_key: "8A" });
    // bpmDiff=10, energy=0, harmonic=0 → 0.1*10 = 1
    expect(transitionPenalty(a, b)).toBeCloseTo(1.0);
  });

  it("applies energy coefficient of 1.5", () => {
    const a = makeTrack({ bpm: 0, energy: 0.2, camelot_key: "8A" });
    const b = makeTrack({ bpm: 0, energy: 0.8, camelot_key: "8A" });
    // energyJump=0.6, bpm=0, harmonic=0 → 1.5*0.6 = 0.9
    expect(transitionPenalty(a, b)).toBeCloseTo(0.9);
  });

  it("applies harmonic coefficient of 2.0", () => {
    // 8A → 8B: camelotDistance=1 → 2.0*1 = 2
    const a = makeTrack({ bpm: 0, energy: 0, camelot_key: "8A" });
    const b = makeTrack({ bpm: 0, energy: 0, camelot_key: "8B" });
    expect(transitionPenalty(a, b)).toBeCloseTo(2.0);
  });

  it("combines all three components", () => {
    const a = makeTrack({ bpm: 120, energy: 0.5, camelot_key: "8A" });
    const b = makeTrack({ bpm: 130, energy: 0.8, camelot_key: "9A" });
    // bpmDiff=10 → 1.0, energyJump=0.3 → 0.45, harmonic=1 → 2.0 → total=3.45
    expect(transitionPenalty(a, b)).toBeCloseTo(3.45);
  });

  it("uses 6 for harmonic penalty when camelot_key is missing", () => {
    const a = makeTrack({ bpm: 0, energy: 0 });
    const b = makeTrack({ bpm: 0, energy: 0 });
    // harmonic = camelotDistance("","") = 6 → 2.0*6 = 12
    expect(transitionPenalty(a, b)).toBeCloseTo(12.0);
  });
});

// ─── buildCompatibilityGraph ──────────────────────────────────────────────────

describe("buildCompatibilityGraph", () => {
  it("returns n×n matrix of zeros for empty tracks", () => {
    const result = buildCompatibilityGraph([]);
    expect(result).toEqual([]);
  });

  it("returns n×n matrix", () => {
    const tracks: TrackWithCamelot[] = [
      makeTrack({ idx: 0 }),
      makeTrack({ idx: 1 }),
      makeTrack({ idx: 2 }),
    ];
    const edges = buildCompatibilityGraph(tracks);
    expect(edges).toHaveLength(3);
    expect(edges[0]).toHaveLength(3);
  });

  it("sets diagonal to 0 (no self-edge)", () => {
    const tracks: TrackWithCamelot[] = [makeTrack({ idx: 0 }), makeTrack({ idx: 1 })];
    const edges = buildCompatibilityGraph(tracks);
    expect(edges[0][0]).toBe(0);
    expect(edges[1][1]).toBe(0);
  });

  it("uses only penalty term when no vectors are present", () => {
    const a = makeTrack({ bpm: 0, energy: 0, camelot_key: "8A", idx: 0 });
    const b = makeTrack({ bpm: 0, energy: 0, camelot_key: "8A", idx: 1 });
    const edges = buildCompatibilityGraph([a, b], 0.7);
    // sim=0 (no vectors), penalty=0 (same key/bpm/energy) → 0.7*0 + 0.3*0 = 0
    expect(edges[0][1]).toBeCloseTo(0);
  });

  it("includes vector similarity when vectors are present", () => {
    const a: TrackWithCamelot = {
      ...makeTrack({ idx: 0, camelot_key: "8A", bpm: 120, energy: 0.5 }),
      _vectors: { default: [1, 0] },
    };
    const b: TrackWithCamelot = {
      ...makeTrack({ idx: 1, camelot_key: "8A", bpm: 120, energy: 0.5 }),
      _vectors: { default: [1, 0] },
    };
    // sim=1 (identical), penalty=0 → 0.7*1 + 0.3*0 = 0.7
    const edges = buildCompatibilityGraph([a, b], 0.7);
    expect(edges[0][1]).toBeCloseTo(0.7);
  });

  it("respects alpha parameter", () => {
    const a: TrackWithCamelot = {
      ...makeTrack({ idx: 0, camelot_key: "8A", bpm: 120, energy: 0.5 }),
      _vectors: { default: [1, 0] },
    };
    const b: TrackWithCamelot = {
      ...makeTrack({ idx: 1, camelot_key: "8A", bpm: 120, energy: 0.5 }),
      _vectors: { default: [1, 0] },
    };
    // alpha=0: 0*sim + 1*-penalty = 0
    const edges = buildCompatibilityGraph([a, b], 0);
    expect(edges[0][1]).toBeCloseTo(0);
  });
});

// ─── greedyPath ───────────────────────────────────────────────────────────────

describe("greedyPath", () => {
  it("returns empty array for no tracks", () => {
    expect(greedyPath([], [])).toEqual([]);
  });

  it("returns [0] for single track", () => {
    const t = makeTrack({ idx: 0 });
    expect(greedyPath([t], [[0]])).toEqual([0]);
  });

  it("always starts from index 0", () => {
    const tracks = [makeTrack({ idx: 0 }), makeTrack({ idx: 1 }), makeTrack({ idx: 2 })];
    const edges = [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ];
    const path = greedyPath(tracks, edges);
    expect(path[0]).toBe(0);
  });

  it("picks the highest-edge neighbor at each step", () => {
    const tracks = [makeTrack({ idx: 0 }), makeTrack({ idx: 1 }), makeTrack({ idx: 2 })];
    // From 0: edges[0][1]=5, edges[0][2]=1 → picks 1
    // From 1: edges[1][2]=3 → picks 2
    const edges = [
      [0, 5, 1],
      [5, 0, 3],
      [1, 3, 0],
    ];
    expect(greedyPath(tracks, edges)).toEqual([0, 1, 2]);
  });

  it("visits all tracks", () => {
    const n = 4;
    const tracks = Array.from({ length: n }, (_, i) => makeTrack({ idx: i }));
    const edges = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : 1)),
    );
    const path = greedyPath(tracks, edges);
    expect(path).toHaveLength(n);
    expect(new Set(path).size).toBe(n);
  });
});

// ─── keyToCamelot ─────────────────────────────────────────────────────────────

describe("keyToCamelot", () => {
  it("returns '-' for null/undefined/empty", () => {
    expect(keyToCamelot(null)).toBe("-");
    expect(keyToCamelot(undefined)).toBe("-");
    expect(keyToCamelot("")).toBe("-");
  });

  it("maps C major to 8B", () => {
    expect(keyToCamelot("C major")).toBe("8B");
  });

  it("maps A minor to 8A", () => {
    expect(keyToCamelot("A minor")).toBe("8A");
  });

  it("maps F# major to 2B", () => {
    expect(keyToCamelot("F# major")).toBe("2B");
  });

  it("maps G# minor to 1A", () => {
    expect(keyToCamelot("G# minor")).toBe("1A");
  });

  it("is case-insensitive for known keys", () => {
    expect(keyToCamelot("c major")).toBe("8B");
    expect(keyToCamelot("A MINOR")).toBe("8A");
  });

  it("handles extra whitespace between note and mode", () => {
    expect(keyToCamelot("C  major")).toBe("8B");
  });

  it("returns the original key when no mapping found", () => {
    expect(keyToCamelot("X# xenomode")).toBe("X# xenomode");
  });

  it("maps Bb major to 6B", () => {
    expect(keyToCamelot("Bb major")).toBe("6B");
  });

  it("maps D minor to 7A", () => {
    expect(keyToCamelot("D minor")).toBe("7A");
  });

  it("handles regex fallback for uppercase note + lowercase mode", () => {
    // The regex branch uppercases note and lowercases mode
    expect(keyToCamelot("C Major")).toBe("8B");
  });
});
