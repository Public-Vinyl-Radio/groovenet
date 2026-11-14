import { describe, expect, it } from "vitest";
import { rankingConfigSchema, RANKING_SIGNAL_IDS, type RankingConfig } from "@groovenet/contracts";
import { buildGenreOverlapContext, MIN_GENRE_OVERLAP } from "@/lib/recommendation-pre-scorer";
import {
  BLEND_RANKING_CONFIG,
  DEFAULT_RANKING_CONFIG,
  MIXABLE_RANKING_CONFIG,
  RANKING_CONFIGS,
  STRICT_RANKING_CONFIG,
  withSuggestionFilters,
} from "../configs";
import { defaultRanker, orderByRanking, resolveSeed, scoreCandidate } from "../ranker";
import type { RankingCandidate, RankingTrack } from "../features";

const config = (overrides: Partial<RankingConfig>): RankingConfig =>
  rankingConfigSchema.parse({ version: 1, id: "test", weights: {}, ...overrides });

const sum = (ranking: ReturnType<typeof scoreCandidate>) =>
  (ranking.prior ?? 0) +
  Object.values(ranking.signals).reduce((total, s) => total + (s?.contribution ?? 0), 0);

describe("default config scoring", () => {
  const seed: RankingTrack = { bpm: "124", key: "8A" };

  it("is the better similarity plus the key and tempo boosts", () => {
    const ranking = scoreCandidate(
      seed,
      { identity: 0.6, vibe: 0.8, key: "8A", bpm: 124 },
      DEFAULT_RANKING_CONFIG,
    );
    expect(ranking.score).toBeCloseTo(0.8 + 0.02 + 0.01, 12);
    expect(ranking.prior).toBeNull();
    expect(ranking.signals.vibe_similarity).toEqual({ value: 0.8, weight: 1, contribution: 0.8 });
    expect(ranking.signals.identity_similarity).toEqual({
      value: 0.6,
      weight: 1,
      contribution: 0,
    });
    expect(ranking.signals.key_relation).toMatchObject({ contribution: 0.02, detail: "same" });
    expect(ranking.signals.bpm_distance).toMatchObject({ contribution: 0.01 });
  });

  it("treats a missing similarity as 0", () => {
    const ranking = scoreCandidate(seed, { identity: null, vibe: null }, DEFAULT_RANKING_CONFIG);
    expect(ranking.score).toBe(0);
    expect(ranking.signals.identity_similarity?.contribution).toBe(0);
  });

  it("lets a prior score stand in for the similarities", () => {
    const ranking = scoreCandidate(
      seed,
      { prior: 0.5, identity: 0.99, vibe: 0.99, key: "9A" },
      DEFAULT_RANKING_CONFIG,
    );
    expect(ranking.prior).toBe(0.5);
    expect(ranking.score).toBeCloseTo(0.51, 12);
    expect(ranking.signals.vibe_similarity?.contribution).toBe(0);
  });

  it("ignores the prior when the config doesn't use it", () => {
    const ranking = scoreCandidate(
      seed,
      { prior: 0.5, identity: 0.9 },
      { ...DEFAULT_RANKING_CONFIG, usePrior: false },
    );
    expect(ranking.prior).toBeNull();
    expect(ranking.score).toBe(0.9);
  });

  it("lists every signal with its weight, 0 when unweighted", () => {
    const ranking = scoreCandidate(seed, { rating: 4 }, DEFAULT_RANKING_CONFIG);
    expect(Object.keys(ranking.signals)).toEqual([...RANKING_SIGNAL_IDS]);
    expect(ranking.signals.rating).toEqual({ value: 0.8, weight: 0, contribution: 0 });
  });
});

describe("breakdown sums", () => {
  const candidates: RankingCandidate[] = [
    { identity: 0.7, vibe: 0.3, key: "9A", bpm: 126, genres: [{ id: "a", parentId: null }] },
    { identity: null, vibe: 0.9, key: "3B", bpm: 90, eraBucket: "1990s", rating: 3 },
    { prior: 0.4, key: "8B", bpm: "125", energy: 0.4, danceability: 0.9 },
    {},
  ];
  const seed: RankingTrack = {
    bpm: 124,
    key: "8A",
    eraBucket: "2000s",
    genres: [{ id: "a", parentId: null }],
    energy: 0.5,
    danceability: 0.5,
  };
  const weighted = config({
    weights: {
      identity_similarity: 0.4,
      vibe_similarity: 0.6,
      genre_overlap: 0.3,
      era: 0.1,
      energy: -0.2,
      danceability: 0.05,
      rating: 0.1,
    },
    usePrior: true,
  });

  it.each(
    Object.values(RANKING_CONFIGS)
      .concat(weighted)
      .map((c) => [c.id, c] as const),
  )("score is the prior plus every contribution (%s)", (_id, rankingConfig) => {
    for (const candidate of candidates) {
      const ranking = scoreCandidate(seed, candidate, rankingConfig);
      expect(sum(ranking)).toBeCloseTo(ranking.score, 12);
    }
  });

  it("adds every weighted signal when there is no base", () => {
    const ranking = scoreCandidate(seed, candidates[0], weighted);
    expect(ranking.signals.identity_similarity?.contribution).toBeCloseTo(0.28, 12);
    expect(ranking.signals.vibe_similarity?.contribution).toBeCloseTo(0.18, 12);
    expect(ranking.signals.genre_overlap?.contribution).toBeCloseTo(0.3, 12);
  });

  it("weights a base signal before taking the best", () => {
    const ranking = scoreCandidate(
      {},
      { identity: 0.9, vibe: 0.6 },
      config({
        weights: { identity_similarity: 0.5, vibe_similarity: 1 },
        base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
      }),
    );
    expect(ranking.score).toBe(0.6);
    expect(ranking.signals.vibe_similarity?.contribution).toBe(0.6);
  });
});

describe("constraints", () => {
  const seed: RankingTrack = { bpm: 100, key: "8A", genres: [{ id: "house", parentId: null }] };
  const failed = (rankingConfig: RankingConfig, candidate: RankingCandidate) =>
    scoreCandidate(seed, candidate, rankingConfig).failed;

  it("bpm_window by ratio rejects beyond the window and passes at its edge", () => {
    const c = config({ constraints: { bpm_window: { unit: "ratio", max: 0.06 } } });
    expect(failed(c, { bpm: 106 })).toEqual([]);
    expect(failed(c, { bpm: 106.1 })).toEqual(["bpm_window"]);
    expect(failed(c, { bpm: 93.9 })).toEqual(["bpm_window"]);
  });

  it("bpm_window in BPM rejects beyond the absolute delta", () => {
    const c = config({ constraints: { bpm_window: { unit: "bpm", max: 4 } } });
    expect(failed(c, { bpm: 104 })).toEqual([]);
    expect(failed(c, { bpm: 104.5 })).toEqual(["bpm_window"]);
  });

  it("bpm_window passes an unknown or zero tempo on either side", () => {
    const c = config({ constraints: { bpm_window: { unit: "ratio", max: 0 } } });
    expect(failed(c, { bpm: null })).toEqual([]);
    expect(failed(c, { bpm: 0 })).toEqual([]);
    expect(scoreCandidate({ bpm: "0" }, { bpm: 150 }, c).failed).toEqual([]);
  });

  it("key_rule on the wheel rejects a clash and passes same, adjacent and relative", () => {
    const c = config({ constraints: { key_rule: { metric: "wheel", max: 1 } } });
    expect(failed(c, { key: "8A" })).toEqual([]);
    expect(failed(c, { key: "9A" })).toEqual([]);
    expect(failed(c, { key: "8B" })).toEqual([]);
    expect(failed(c, { key: "10A" })).toEqual(["key_rule"]);
    expect(failed(c, { key: "9B" })).toEqual(["key_rule"]);
  });

  it("key_rule passes an unknown key on either side", () => {
    const c = config({ constraints: { key_rule: { metric: "wheel", max: 0 } } });
    expect(failed(c, { key: null })).toEqual([]);
    expect(failed(c, { key: "H major" })).toEqual([]);
    const camelot = config({ constraints: { key_rule: { metric: "camelot", max: 0 } } });
    expect(failed(camelot, { key: null })).toEqual([]);
    expect(failed(camelot, {})).toEqual([]);
    expect(scoreCandidate({}, { key: "8A" }, camelot).failed).toEqual([]);
  });

  it("key_rule on the pre-scorer's metric counts relative as 0.5 and a mode change +0.5", () => {
    const c = config({ constraints: { key_rule: { metric: "camelot", max: 1 } } });
    const majorSeed: RankingTrack = { key: "C Major" };
    expect(scoreCandidate(majorSeed, { key: "A Minor" }, c).failed).toEqual([]);
    expect(scoreCandidate(majorSeed, { key: "G Major" }, c).failed).toEqual([]);
    expect(scoreCandidate(majorSeed, { key: "E Minor" }, c).failed).toEqual(["key_rule"]);
  });

  it("genre_floor rejects below the floor and when either side has no genres", () => {
    const c = config({ constraints: { genre_floor: { min: MIN_GENRE_OVERLAP } } });
    expect(failed(c, { genres: [{ id: "house", parentId: null }] })).toEqual([]);
    expect(failed(c, { genres: [{ id: "rock", parentId: null }] })).toEqual(["genre_floor"]);
    expect(failed(c, { genres: [] })).toEqual(["genre_floor"]);
  });

  it("reports every failed constraint, and never changes the score", () => {
    const c = config({
      weights: { identity_similarity: 1 },
      constraints: {
        bpm_window: { unit: "bpm", max: 1 },
        key_rule: { metric: "wheel", max: 0 },
        genre_floor: { min: 1 },
      },
    });
    const ranking = scoreCandidate(seed, { bpm: 130, key: "3A", identity: 0.5 }, c);
    expect(ranking.failed).toEqual(["bpm_window", "key_rule", "genre_floor"]);
    expect(ranking.passed).toBe(false);
    expect(ranking.score).toBe(0.5);
  });
});

// The pre-scorer's mode tests, ported: same fixtures, same pass/fail.
describe("pre-scorer modes as configs", () => {
  const HOUSE = { id: "house", parentId: "electronic" };
  const TECHNO = { id: "techno", parentId: "electronic" };
  const SALSA = { id: "salsa", parentId: "latin" };
  const CUMBIA = { id: "cumbia", parentId: "latin" };
  const CHICHA = { id: "chicha", parentId: "latin" };
  const PORRO = { id: "porro", parentId: "latin" };
  const ROCK = { id: "rock", parentId: null };
  const LATIN_CONTEXT = buildGenreOverlapContext(
    [
      { genreId: "cumbia", relatedGenreId: "chicha", score: 1.6 },
      { genreId: "porro", relatedGenreId: "cumbia", score: 1 },
    ],
    [{ id: "latin", parentId: null }, CUMBIA, CHICHA, PORRO, SALSA, ROCK],
  );
  const seed = (overrides: Partial<RankingTrack> = {}): RankingTrack => ({
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [HOUSE, TECHNO],
    energy: 0.7,
    danceability: 0.8,
    ...overrides,
  });
  const candidate = (overrides: Partial<RankingCandidate> = {}): RankingCandidate => ({
    identity: 0.9,
    vibe: 0.85,
    bpm: 129,
    key: "G Major",
    eraBucket: "1990s",
    genres: [HOUSE],
    energy: 0.75,
    danceability: 0.8,
    ...overrides,
  });
  const passing = (
    rankingConfig: RankingConfig,
    seedTrack: RankingTrack,
    candidates: Record<string, RankingCandidate>,
    context = buildGenreOverlapContext([], []),
  ) =>
    Object.entries(candidates)
      .filter(([, c]) => scoreCandidate(seedTrack, c, rankingConfig, context).passed)
      .map(([name]) => name);

  it("strict keeps only candidates that pass every strict constraint", () => {
    expect(
      passing(STRICT_RANKING_CONFIG, seed(), {
        good: candidate(),
        "bad-bpm": candidate({ bpm: 133 }),
        "bad-key": candidate({ key: "F# Major" }),
        "bad-tag": candidate({ genres: [SALSA] }),
      }),
    ).toEqual(["good"]);
  });

  it("strict keeps a Cumbia seed's Chicha and Porro candidates (#487)", () => {
    expect(
      passing(
        STRICT_RANKING_CONFIG,
        seed({ genres: [CUMBIA] }),
        {
          chicha: candidate({ genres: [CHICHA] }),
          porro: candidate({ genres: [PORRO] }),
          rock: candidate({ genres: [ROCK] }),
        },
        LATIN_CONTEXT,
      ),
    ).toEqual(["chicha", "porro"]);
  });

  it("strict rejects a link below the minimum overlap", () => {
    const weak = buildGenreOverlapContext(
      [{ genreId: "cumbia", relatedGenreId: "rock", score: 0.1 }],
      [],
    );
    expect(
      passing(
        STRICT_RANKING_CONFIG,
        seed({ genres: [CUMBIA] }),
        { rock: candidate({ genres: [ROCK] }) },
        weak,
      ),
    ).toEqual([]);
  });

  it("mixable accepts a wider BPM range than strict", () => {
    expect(
      passing(MIXABLE_RANKING_CONFIG, seed({ genres: [] }), {
        good: candidate({ bpm: 134, key: "D Major" }),
        "bad-bpm": candidate({ bpm: 135, key: "D Major" }),
      }),
    ).toEqual(["good"]);
  });

  it("blend accepts the widest BPM range and any key", () => {
    expect(
      passing(BLEND_RANKING_CONFIG, seed({ genres: [] }), {
        good: candidate({ bpm: 140, key: "F# Major", eraBucket: "2010s" }),
        "bad-bpm": candidate({ bpm: 141, key: "F# Major", eraBucket: "2010s" }),
      }),
    ).toEqual(["good"]);
  });

  it("carry the pre-scorer's genre and era bonuses exactly", () => {
    const ranking = scoreCandidate(
      seed(),
      candidate({ genres: [HOUSE, TECHNO], eraBucket: "1990s" }),
      BLEND_RANKING_CONFIG,
    );
    expect(ranking.signals.genre_overlap?.contribution).toBe(0.08);
    expect(ranking.signals.era?.contribution).toBe(0.02);
    const adjacent = scoreCandidate(
      seed(),
      candidate({ eraBucket: "2000s" }),
      BLEND_RANKING_CONFIG,
    );
    expect(adjacent.signals.era?.contribution).toBe(0.01);
  });
});

describe("defaultRanker", () => {
  it("returns one ranking per candidate, in input order", () => {
    const rankings = defaultRanker.rank({
      seed: { track: { key: "8A" } },
      candidates: [{ identity: 0.1 }, { identity: 0.9 }],
      context: { surface: "recommendations" },
      config: DEFAULT_RANKING_CONFIG,
    });
    expect(rankings.map((r) => r.score)).toEqual([0.1, 0.9]);
  });

  it("scores a playlist seed against its last track", () => {
    const [ranking] = defaultRanker.rank({
      seed: { playlist: [{ key: "1A" }, { key: "8A" }] },
      candidates: [{ key: "8A" }],
      context: { surface: "suggestions" },
      config: DEFAULT_RANKING_CONFIG,
    });
    expect(ranking.signals.key_relation?.detail).toBe("same");
  });

  it("scores against nothing for an empty playlist", () => {
    expect(resolveSeed({ playlist: [] })).toBeNull();
    const [ranking] = defaultRanker.rank({
      seed: { playlist: [] },
      candidates: [{ key: "8A", identity: 0.3 }],
      context: { surface: "suggestions" },
      config: DEFAULT_RANKING_CONFIG,
    });
    expect(ranking.score).toBe(0.3);
    expect(ranking.signals.key_relation?.value).toBeNull();
  });
});

describe("orderByRanking", () => {
  it("drops failed candidates and sorts best first, keeping ties in input order", () => {
    const rank = (score: number, passed = true) => ({
      score,
      passed,
      failed: passed ? [] : (["key_rule"] as const).slice(),
      prior: null,
      signals: {},
    });
    expect(
      orderByRanking(["a", "b", "c", "d"], [rank(0.5), rank(0.9, false), rank(0.7), rank(0.5)]),
    ).toEqual(["c", "a", "d"]);
  });
});

describe("config validation", () => {
  it("accepts every built-in config and round-trips it through JSON", () => {
    for (const builtIn of Object.values(RANKING_CONFIGS)) {
      expect(rankingConfigSchema.parse(JSON.parse(JSON.stringify(builtIn)))).toEqual(builtIn);
    }
  });

  it("defaults constraints and the prior", () => {
    const parsed = rankingConfigSchema.parse({ version: 1, id: "x", weights: {} });
    expect(parsed.constraints).toEqual({});
    expect(parsed.usePrior).toBe(false);
  });

  it.each([
    ["an unknown signal", { weights: { tempo: 1 } }],
    ["an out-of-range weight", { weights: { rating: 11 } }],
    ["a non-finite weight", { weights: { rating: Infinity } }],
    ["an unknown version", { version: 2 }],
    ["an extra field", { script: "rm -rf /" }],
    ["an unknown base signal", { base: { combine: "max", signals: ["tempo"] } }],
    ["a negative window", { constraints: { bpm_window: { unit: "ratio", max: -1 } } }],
    ["an unknown key metric", { constraints: { key_rule: { metric: "circle", max: 1 } } }],
    ["a genre floor above 1", { constraints: { genre_floor: { min: 2 } } }],
  ])("rejects %s", (_label, overrides) => {
    expect(
      rankingConfigSchema.safeParse({ version: 1, id: "x", weights: {}, ...overrides }).success,
    ).toBe(false);
  });
});

describe("withSuggestionFilters", () => {
  it("keeps the config's constraints only for toggles that are on", () => {
    expect(withSuggestionFilters(DEFAULT_RANKING_CONFIG, {}).constraints).toEqual({
      key_rule: null,
      bpm_window: null,
    });
    expect(
      withSuggestionFilters(DEFAULT_RANKING_CONFIG, {
        compatibleKey: true,
        bpmWithinSixPercent: true,
      }).constraints,
    ).toEqual(DEFAULT_RANKING_CONFIG.constraints);
  });

  it("leaves a constraint off when the config has none, and keeps the others", () => {
    const filtered = withSuggestionFilters(STRICT_RANKING_CONFIG, { compatibleKey: true });
    expect(filtered.constraints.key_rule).toEqual(STRICT_RANKING_CONFIG.constraints.key_rule);
    expect(filtered.constraints.bpm_window).toBeNull();
    expect(filtered.constraints.genre_floor).toEqual({ min: MIN_GENRE_OVERLAP });
    const none = config({});
    expect(
      withSuggestionFilters(none, { compatibleKey: true, bpmWithinSixPercent: true }).constraints,
    ).toEqual({ key_rule: null, bpm_window: null });
  });
});
