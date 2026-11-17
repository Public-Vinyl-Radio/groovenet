import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  rankingConfigSchema,
  toRankingConfig,
  type RankingConfigInput,
} from "@groovenet/contracts";
import { DEFAULT_RANKING_CONFIG, STRICT_RANKING_CONFIG } from "../configs";
import {
  CONSTRAINT_PENALTY,
  LEGACY_TRANSITION_WEIGHTS,
  optimizerRankingFor,
  optimizerRankingSchema,
  toOptimizerRanking,
} from "../ordering";
import { orderingMetrics } from "../orderingMetrics";
import { RANKING_PRESETS } from "../profiles";

// Shared with ga-service, which pins the orderings it builds from these rankings.
const fixtures = path.resolve(__dirname, "../../../../../ga-service/tests/fixtures");
const read = (name: string) => JSON.parse(readFileSync(path.join(fixtures, name), "utf8"));
const presets = read("preset_orderings.json") as {
  rankings: Record<string, unknown>;
  orderings: Record<string, Record<string, string[]>>;
  metrics: Record<string, Record<string, Record<string, number>>>;
};
const playlist = read("playlist.json").tracks as Array<{
  track_id: string;
  bpm: number;
  key: string;
  embedding: string;
}>;

const config = (input: Partial<RankingConfigInput>) =>
  rankingConfigSchema.parse({ version: 2, id: "x", weights: {}, ...input });

const total = (weights: Record<string, number>) =>
  weights.metadata + weights.embedding + weights.energy + weights.bpm + weights.key;

describe("toOptimizerRanking", () => {
  it("translates Beatmatcher and Selector exactly as ga-service's fixture holds them", () => {
    for (const id of ["beatmatcher", "selector"] as const) {
      expect(toOptimizerRanking(toRankingConfig(RANKING_PRESETS[id]))).toEqual(
        presets.rankings[id],
      );
    }
  });

  it("maps signals onto ga-service's terms and keeps their total at the optimiser's own", () => {
    const ranking = toOptimizerRanking(
      config({
        weights: {
          vibe_similarity: 2,
          genre_overlap: 1,
          energy: 0.5,
          danceability: 0.5,
          bpm_distance: 1,
          key_relation: 1,
          era: 5,
          rating: 5,
        },
      }),
    );
    // vibe 2 + genre 1 + energy 1 + bpm 1 + key 1 = 6, scaled to 0.93; era and rating dropped.
    const scale = 0.93 / 6;
    expect(ranking.weights.embedding).toBeCloseTo(2 * scale);
    expect(ranking.weights.metadata).toBeCloseTo(scale);
    expect(ranking.weights.energy).toBeCloseTo(scale);
    expect(ranking.weights.bpm).toBeCloseTo(scale);
    expect(ranking.weights.key).toBeCloseTo(scale);
    expect(total(ranking.weights)).toBeCloseTo(0.93, 12);
    expect(ranking.weights.same_artist).toBe(LEGACY_TRANSITION_WEIGHTS.same_artist);
    expect(ranking.weights.same_album).toBe(LEGACY_TRANSITION_WEIGHTS.same_album);
    expect(ranking.constraint_penalty).toBe(CONSTRAINT_PENALTY);
  });

  it("takes the larger similarity when both are max base signals, and adds them otherwise", () => {
    const both = { identity_similarity: 0.8, vibe_similarity: 1, bpm_distance: 1 };
    const maxed = toOptimizerRanking(
      config({
        weights: both,
        base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
      }),
    );
    expect(maxed.weights.embedding / maxed.weights.bpm).toBeCloseTo(1);
    const added = toOptimizerRanking(config({ weights: both }));
    expect(added.weights.embedding / added.weights.bpm).toBeCloseTo(1.8);
    const partly = toOptimizerRanking(
      config({ weights: both, base: { combine: "max", signals: ["vibe_similarity"] } }),
    );
    expect(partly.weights.embedding / partly.weights.bpm).toBeCloseTo(1.8);
  });

  it("counts negative weights as 0, and no weight at all as all zeros", () => {
    const ranking = toOptimizerRanking(config({ weights: { key_relation: -2, bpm_distance: 1 } }));
    expect(ranking.weights.key).toBe(0);
    expect(ranking.weights.bpm).toBeCloseTo(0.93);
    const none = toOptimizerRanking(config({ weights: { era: 1 } }));
    expect(total(none.weights)).toBe(0);
  });

  it("carries the BPM window, key rule and energy range, but not the genre floor", () => {
    const ranking = toOptimizerRanking(STRICT_RANKING_CONFIG);
    expect(ranking.constraints).toEqual({
      bpm_window: { unit: "bpm", max: 4 },
      key_rule: { metric: "camelot", max: 1 },
      energy_range: null,
    });
    const energy = toOptimizerRanking(
      config({ constraints: { energy_range: { max_drop: 0.1, max_rise: 0.2 } } }),
    );
    expect(energy.constraints.energy_range).toEqual({ max_drop: 0.1, max_rise: 0.2 });
  });

  it("always produces a payload ga-service accepts", () => {
    const extreme = config({
      weights: { vibe_similarity: 10, bpm_distance: 10, key_relation: 10 },
      constraints: {
        bpm_window: { unit: "bpm", max: 1000, half_double: true },
        key_rule: { metric: "wheel", max: 12 },
        energy_range: { max_drop: 1, max_rise: 1 },
      },
    });
    for (const input of [extreme, DEFAULT_RANKING_CONFIG, STRICT_RANKING_CONFIG]) {
      expect(optimizerRankingSchema.safeParse(toOptimizerRanking(input)).success).toBe(true);
    }
    expect(
      optimizerRankingSchema.safeParse({ ...toOptimizerRanking(extreme), extra: 1 }).success,
    ).toBe(false);
  });
});

describe("optimizerRankingFor", () => {
  const ranker = (id: string, fallback = false) => ({
    id,
    config: id === "strict" ? STRICT_RANKING_CONFIG : toRankingConfig(RANKING_PRESETS.beatmatcher),
    fallback,
  });

  it("sends nothing for Default or a fallback, so the request is today's", () => {
    expect(
      optimizerRankingFor({ id: "default", config: DEFAULT_RANKING_CONFIG, fallback: false }),
    ).toBeNull();
    expect(optimizerRankingFor(ranker("12", true))).toBeNull();
  });

  it("sends a preset, a built-in config or a stored profile", () => {
    expect(optimizerRankingFor(ranker("beatmatcher"))).toEqual(presets.rankings.beatmatcher);
    expect(optimizerRankingFor(ranker("strict"))).toEqual(
      toOptimizerRanking(STRICT_RANKING_CONFIG),
    );
    expect(optimizerRankingFor(ranker("12"))).toEqual(presets.rankings.beatmatcher);
  });
});

describe("orderingMetrics on the orderings ga-service pins", () => {
  const byId = new Map(playlist.map((track) => [track.track_id, track]));
  const tracks = (ids: string[]) => ids.map((id) => byId.get(id)!);

  it("agrees with ga-service's metrics.py", () => {
    for (const [profile, modes] of Object.entries(presets.orderings)) {
      for (const [mode, ids] of Object.entries(modes)) {
        const expected = presets.metrics[profile][mode];
        const actual = orderingMetrics(tracks(ids));
        expect(actual.transitions).toBe(expected.transitions);
        expect(actual.bpmJumps).toBeCloseTo(expected.bpm_jumps, 9);
        expect(actual.keyClashes).toBe(expected.key_clashes);
        expect(actual.vibeDistance).toBeCloseTo(expected.vibe_distance, 9);
      }
    }
  });

  it("shows Beatmatcher mixing tempo and key, and Selector keeping the vibe", () => {
    for (const mode of ["genetic", "greedy"]) {
      const beat = orderingMetrics(tracks(presets.orderings.beatmatcher[mode]));
      const selector = orderingMetrics(tracks(presets.orderings.selector[mode]));
      expect(beat.bpmJumps).toBeLessThan(selector.bpmJumps);
      expect(beat.keyClashes).toBeLessThan(selector.keyClashes);
      expect(selector.vibeDistance).toBeLessThan(beat.vibeDistance);
    }
  });
});
