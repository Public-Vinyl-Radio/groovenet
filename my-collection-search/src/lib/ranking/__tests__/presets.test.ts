/**
 * Pinned orderings for the Beatmatcher and Selector presets (#1192), on a
 * fixture built to pull them apart. Default's ordering is pinned separately,
 * by `ranking.golden.test.ts`, and must not move. A tuning change to a preset
 * updates these lists deliberately and says why in the PR.
 */
import { describe, expect, it } from "vitest";
import { toRankingConfig, type RankingPresetId } from "@groovenet/contracts";
import { rankSuggestions } from "@/lib/rankSuggestions";
import { DEFAULT_RANKING_CONFIG } from "../configs";
import { RANKING_PRESETS } from "../profiles";
import { PRESET_CANDIDATES, PRESET_SEED } from "./presetFixture";

const order = (id: RankingPresetId, filters = { compatibleKey: true, bpmWithinSixPercent: true }) =>
  rankSuggestions(PRESET_CANDIDATES, {
    seed: PRESET_SEED,
    filters,
    config: toRankingConfig(RANKING_PRESETS[id]),
  });
const ids = (id: RankingPresetId, filters?: Parameters<typeof order>[1]) =>
  order(id, filters).tracks.map((t) => t.track_id);

describe("preset orderings", () => {
  it("Default is today's ranking, unchanged", () => {
    expect(toRankingConfig(RANKING_PRESETS.default)).toEqual(DEFAULT_RANKING_CONFIG);
    expect(ids("default")).toEqual([
      "no-analysis",
      "all-rounder",
      "relative-key",
      "mixable-stranger",
      "locked-but-unrelated",
    ]);
  });

  it("Beatmatcher puts locked tempo and key first and keeps half time", () => {
    expect(ids("beatmatcher")).toEqual([
      "all-rounder",
      "mixable-stranger",
      "half-time-adjacent",
      "locked-but-unrelated",
      "relative-key",
      "no-analysis",
    ]);
    expect(order("beatmatcher").hiddenByFilters).toBe(3);
  });

  it("Selector puts the vibe first and hides nothing", () => {
    expect(ids("selector")).toEqual([
      "vibe-twin-off-tempo",
      "no-analysis",
      "calm-vibe",
      "genre-match-two-steps",
      "all-rounder",
      "half-time-adjacent",
      "relative-key",
      "mixable-stranger",
      "locked-but-unrelated",
    ]);
    expect(order("selector").hiddenByFilters).toBe(0);
  });

  it("Selector's order doesn't depend on the toggles: it has no constraints for them", () => {
    expect(ids("selector", { compatibleKey: false, bpmWithinSixPercent: false })).toEqual(
      ids("selector"),
    );
  });
});

describe("switching profile", () => {
  it("changes the suggestions for the same seed", () => {
    const beatmatcher = ids("beatmatcher");
    const selector = ids("selector");
    expect(beatmatcher).not.toEqual(selector);
    expect(beatmatcher[0]).toBe("all-rounder");
    expect(selector[0]).toBe("vibe-twin-off-tempo");
    // The mixable stranger is Beatmatcher's second pick and Selector's second last.
    expect(beatmatcher.indexOf("mixable-stranger")).toBe(1);
    expect(selector.indexOf("mixable-stranger")).toBe(selector.length - 2);
    // The off-tempo vibe twin is Selector's first and outside Beatmatcher's window.
    expect(beatmatcher).not.toContain("vibe-twin-off-tempo");
  });

  it("Beatmatcher's top picks are closer in tempo, Selector's closer in vibe", () => {
    const top = (id: RankingPresetId) => order(id).tracks.slice(0, 3);
    const meanBpmGap = (tracks: ReturnType<typeof top>) =>
      tracks.reduce((sum, t) => {
        const bpm = Number(t.bpm);
        const nearest = Math.min(...[bpm, bpm * 2, bpm / 2].map((b) => Math.abs(b - 124)));
        return sum + nearest;
      }, 0) / tracks.length;
    const meanVibe = (tracks: ReturnType<typeof top>) =>
      tracks.reduce((sum, t) => sum + (t._simAudio ?? 0), 0) / tracks.length;
    expect(meanBpmGap(top("beatmatcher"))).toBeLessThan(meanBpmGap(top("selector")));
    expect(meanVibe(top("selector"))).toBeGreaterThan(meanVibe(top("beatmatcher")));
  });
});
