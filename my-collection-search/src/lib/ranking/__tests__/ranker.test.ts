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
  rankingConfigSchema.parse({ version: 2, id: "test", weights: {}, ...overrides });

const sum = (ranking: ReturnType<typeof scoreCandidate>) =>
  (ranking.prior ?? 0) +
  Object.values(ranking.signals).reduce((total, s) => total + (s?.contribution ?? 0), 0);

describe("default config scoring", () => {
  const seed: RankingTrack = { bpm: "124", key: "8A" };

  it("is the better similarity, by rank in the pool, plus the key and tempo boosts", () => {
    const [ranking] = defaultRanker.rank({
      seed: { track: seed },
      candidates: [
        { identity: 0.6, vibe: 0.8, key: "8A", bpm: 124 },
        { identity: 0.9, vibe: 0.7 },
        { identity: 0.3, vibe: 0.4 },
      ],
      context: { surface: "suggestions" },
      config: DEFAULT_RANKING_CONFIG,
    });
    // Vibe 0.8 is the pool's best (1); identity 0.6 is its middle (0.5).
    expect(ranking.score).toBeCloseTo(1 + 0.02 + 0.01, 12);
    expect(ranking.prior).toBeNull();
    expect(ranking.signals.vibe_similarity).toEqual({
      value: 1,
      weight: 1,
      contribution: 1,
      detail: "raw 0.8000",
    });
    expect(ranking.signals.identity_similarity).toEqual({
      value: 0.5,
      weight: 1,
      contribution: 0,
      detail: "raw 0.6000",
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
    // Alone, it is its pool's closest identity match.
    expect(ranking.score).toBe(1);
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
    const [ranking] = defaultRanker.rank({
      seed: { track: seed },
      candidates,
      context: { surface: "recommendations" },
      config: weighted,
    });
    // The only identity score is the best (1); vibe 0.3 is below 0.9 (0).
    expect(ranking.signals.identity_similarity?.contribution).toBeCloseTo(0.4, 12);
    expect(ranking.signals.vibe_similarity?.contribution).toBe(0);
    expect(ranking.signals.genre_overlap?.contribution).toBeCloseTo(0.3, 12);
  });

  it("weights a base signal before taking the best", () => {
    const [ranking] = defaultRanker.rank({
      seed: { track: {} },
      candidates: [
        { identity: 0.9, vibe: 0.6 },
        { identity: 0.1, vibe: 0.9 },
      ],
      context: { surface: "recommendations" },
      config: config({
        weights: { identity_similarity: 0.5, vibe_similarity: 1 },
        base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
      }),
    });
    // Identity 1 × 0.5 beats vibe 0 × 1.
    expect(ranking.score).toBe(0.5);
    expect(ranking.signals.identity_similarity?.contribution).toBe(0.5);
    expect(ranking.signals.vibe_similarity?.contribution).toBe(0);
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

  it("key_rule on the pre-scorer's metric reads stored key spellings (#1211)", () => {
    const c = config({ constraints: { key_rule: { metric: "camelot", max: 1 } } });
    const rejects = (seedKey: string | null, key: string | null) =>
      scoreCandidate({ key: seedKey }, { key }, c).failed;
    // Case: the stored spelling is lower case.
    expect(rejects("C major", "C Major")).toEqual([]);
    expect(rejects("C major", "A major")).toEqual(["key_rule"]);
    // Sharps and flats, and enharmonics (Db major = 3B).
    expect(rejects("F# minor", "F# Minor")).toEqual([]);
    expect(rejects("F# minor", "C minor")).toEqual(["key_rule"]);
    expect(rejects("Bb major", "F major")).toEqual([]);
    expect(rejects("Bb major", "E major")).toEqual(["key_rule"]);
    expect(rejects("Db major", "Ab major")).toEqual([]);
    expect(rejects("Db major", "C major")).toEqual(["key_rule"]);
    // Relative major/minor.
    expect(rejects("C major", "A minor")).toEqual([]);
    // Unknown or missing on either side passes.
    expect(rejects("C major", "nonsense")).toEqual([]);
    expect(rejects("nonsense", "C major")).toEqual([]);
    expect(rejects(null, "C major")).toEqual([]);
    expect(rejects("C major", null)).toEqual([]);
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
    expect(ranking.score).toBe(1);
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
    expect(rankings.map((r) => r.score)).toEqual([0, 1]);
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
    expect(ranking.score).toBe(1);
    expect(ranking.signals.key_relation?.value).toBeNull();
  });
});

describe("pool-normalised similarity (#1218)", () => {
  const rank = (candidates: RankingCandidate[], rankingConfig = DEFAULT_RANKING_CONFIG) =>
    defaultRanker.rank({
      seed: { track: { bpm: 124, key: "8A" } },
      candidates,
      context: { surface: "suggestions" },
      config: rankingConfig,
    });
  const vibe = (rankings: ReturnType<typeof rank>) =>
    rankings.map((r) => r.signals.vibe_similarity?.value);

  it("spreads a bunched pool over [0, 1] by rank", () => {
    expect(vibe(rank([{ vibe: 0.9871 }, { vibe: 0.9902 }, { vibe: 0.9866 }]))).toEqual([0.5, 1, 0]);
  });

  it("gives tied candidates the higher rank", () => {
    expect(vibe(rank([{ vibe: 0.5 }, { vibe: 0.9 }, { vibe: 0.5 }, { vibe: 0.1 }]))).toEqual([
      2 / 3,
      1,
      2 / 3,
      0,
    ]);
  });

  it("scores a single candidate and an all-equal pool as the pool's best", () => {
    expect(vibe(rank([{ vibe: 0.42 }]))).toEqual([1]);
    expect(vibe(rank([{ vibe: 0.7 }, { vibe: 0.7 }, { vibe: 0.7 }]))).toEqual([1, 1, 1]);
  });

  it("leaves a missing similarity null and ranks only the ones present", () => {
    const rankings = rank([{ vibe: 0.2 }, { vibe: null }, {}, { vibe: 0.8 }]);
    expect(vibe(rankings)).toEqual([0, null, null, 1]);
    expect(rankings[1].signals.vibe_similarity?.detail).toBeUndefined();
    expect(rankings[1].score).toBe(0);
  });

  it("handles a pool with no similarities, and an empty pool", () => {
    const rankings = rank([{ key: "8A" }, { key: "9A" }]);
    expect(vibe(rankings)).toEqual([null, null]);
    expect(rankings.map((r) => r.score)).toEqual([0.02, 0.01]);
    expect(rank([])).toEqual([]);
  });

  it("lets an identity-only candidate compete with vibe candidates under the max base", () => {
    // Raw, vibe (~0.99) always beat identity (~0.8): now each index's best scores 1.
    const rankings = rank([
      { identity: 0.82 },
      { identity: 0.75, vibe: 0.986 },
      { vibe: 0.992 },
      { identity: 0.7, vibe: 0.988 },
    ]);
    expect(rankings.map((r) => r.score)).toEqual([1, 0.5, 1, 0.5]);
  });

  it("ranks over every candidate, so a filter never rescales the rest", () => {
    const candidates: RankingCandidate[] = [
      { vibe: 0.9, bpm: 200 },
      { vibe: 0.5, bpm: 124 },
      { vibe: 0.1, bpm: 124 },
    ];
    const filtered = rank(candidates);
    const open = rank(candidates, withSuggestionFilters(DEFAULT_RANKING_CONFIG, {}));
    expect(filtered[0].passed).toBe(false);
    expect(vibe(filtered)).toEqual(vibe(open));
  });

  it("leaves a prior raw: it isn't a pool signal", () => {
    const [ranking] = rank([{ prior: 0.37, vibe: 0.99 }]);
    expect(ranking.prior).toBe(0.37);
    expect(ranking.score).toBe(0.37);
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
    const parsed = rankingConfigSchema.parse({ version: 2, id: "x", weights: {} });
    expect(parsed.constraints).toEqual({});
    expect(parsed.usePrior).toBe(false);
  });

  it.each([
    ["an unknown signal", { weights: { tempo: 1 } }],
    ["an out-of-range weight", { weights: { rating: 11 } }],
    ["a non-finite weight", { weights: { rating: Infinity } }],
    ["an unknown version", { version: 3 }],
    ["a v1 config (raw similarity, before #1218)", { version: 1 }],
    ["an extra field", { script: "rm -rf /" }],
    ["an unknown base signal", { base: { combine: "max", signals: ["tempo"] } }],
    ["a negative window", { constraints: { bpm_window: { unit: "ratio", max: -1 } } }],
    ["an unknown key metric", { constraints: { key_rule: { metric: "circle", max: 1 } } }],
    ["a genre floor above 1", { constraints: { genre_floor: { min: 2 } } }],
  ])("rejects %s", (_label, overrides) => {
    expect(
      rankingConfigSchema.safeParse({ version: 2, id: "x", weights: {}, ...overrides }).success,
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
