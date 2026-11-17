/** The constraint options profiles added (#1192): half and double time, and an energy range. */
import { describe, expect, it } from "vitest";
import { rankingConfigSchema, type RankingConfig } from "@groovenet/contracts";
import { DEFAULT_RANKING_CONFIG } from "../configs";
import { scoreCandidate } from "../ranker";
import { computeSignals } from "../signals";
import type { RankingTrack } from "../features";

const config = (constraints: RankingConfig["constraints"]): RankingConfig =>
  rankingConfigSchema.parse({ version: 2, id: "t", weights: { bpm_distance: 1 }, constraints });

describe("bpm_window half and double time", () => {
  const seed: RankingTrack = { bpm: 124 };
  const ratio = config({ bpm_window: { unit: "ratio", max: 0.06, half_double: true } });
  const bpm = config({ bpm_window: { unit: "bpm", max: 4, half_double: true } });

  it("passes a candidate at half or double time within the window", () => {
    for (const candidateBpm of [62, 60, 248, 250, 124, 130]) {
      expect(scoreCandidate(seed, { bpm: candidateBpm }, ratio).failed).toEqual([]);
    }
    expect(scoreCandidate(seed, { bpm: 64 }, bpm).failed).toEqual([]);
  });

  it("still rejects outside the window at every multiple", () => {
    for (const candidateBpm of [55, 70, 200, 270, 140]) {
      expect(scoreCandidate(seed, { bpm: candidateBpm }, ratio).failed).toEqual(["bpm_window"]);
    }
    expect(scoreCandidate(seed, { bpm: 65 }, bpm).failed).toEqual(["bpm_window"]);
  });

  it("is off when omitted, as in Default", () => {
    expect(DEFAULT_RANKING_CONFIG.constraints.bpm_window).not.toHaveProperty("half_double");
    const off = config({ bpm_window: { unit: "ratio", max: 0.06 } });
    expect(scoreCandidate(seed, { bpm: 62 }, off).failed).toEqual(["bpm_window"]);
    expect(scoreCandidate(seed, { bpm: 62 }, off).signals.bpm_distance?.value).toBe(0.5);
  });

  it("scores the tempo signal at the nearest multiple", () => {
    const half = scoreCandidate(seed, { bpm: 62 }, ratio).signals.bpm_distance;
    expect(half).toMatchObject({ value: 1, detail: "124 → 62 (×2)" });
    const double = scoreCandidate(seed, { bpm: 250 }, ratio).signals.bpm_distance;
    expect(double?.value).toBeCloseTo(1 - 1 / 124, 12);
    expect(double?.detail).toBe("124 → 250 (×½)");
    const near = scoreCandidate(seed, { bpm: 126 }, ratio).signals.bpm_distance;
    expect(near?.detail).toBe("124 → 126");
  });

  it("leaves the tempo signal alone without the option", () => {
    expect(computeSignals(seed, { bpm: 62 }).bpm_distance.value).toBe(0.5);
    expect(
      computeSignals(seed, { bpm: 62 }, undefined, { halfDouble: true }).bpm_distance.value,
    ).toBe(1);
  });
});

describe("energy_range", () => {
  const seed: RankingTrack = { energy: 0.5 };
  const range = config({ energy_range: { max_drop: 0.1, max_rise: 0.2 } });
  const failed = (energy: number | null | undefined, s: RankingTrack = seed) =>
    scoreCandidate(s, { energy }, range).failed;

  it("passes inside the range, at its edges", () => {
    for (const energy of [0.4, 0.45, 0.5, 0.6, 0.7]) expect(failed(energy)).toEqual([]);
  });

  it("rejects too big a drop or rise", () => {
    expect(failed(0.39)).toEqual(["energy_range"]);
    expect(failed(0.71)).toEqual(["energy_range"]);
  });

  it("passes unknown energy on either side", () => {
    expect(failed(null)).toEqual([]);
    expect(failed(undefined)).toEqual([]);
    expect(failed(0.99, { energy: null })).toEqual([]);
  });

  it("never changes the score", () => {
    const withRange = scoreCandidate(seed, { energy: 0.9, bpm: 120 }, range);
    const without = scoreCandidate(seed, { energy: 0.9, bpm: 120 }, config({}));
    expect(withRange.score).toBe(without.score);
    expect(withRange.passed).toBe(false);
  });
});
