/**
 * The built-in ranking configs, as data (#1191). `default` is today's live
 * suggestion ranking; `blend`, `mixable` and `strict` are the pre-scorer's
 * modes. Ranking profiles (#1192) start as copies of these.
 */
import {
  rankingConfigSchema,
  type RankingConfig,
  type RankingConfigId,
  type RankingConfigInput,
  type RankingSurface,
} from "@groovenet/contracts";
import { MIN_GENRE_OVERLAP, TAG_BONUS_WEIGHT } from "@/lib/recommendation-pre-scorer";

const define = (config: RankingConfigInput): RankingConfig => rankingConfigSchema.parse(config);

/**
 * Today's suggestions: the better of identity and vibe similarity (or a
 * precomputed score), plus small key and tempo boosts. Same key +0.02,
 * adjacent or relative +0.01, tempo up to +0.01. The Compatible key and
 * ±6% BPM toggles are the two constraints; `withSuggestionFilters` turns
 * them off.
 */
export const DEFAULT_RANKING_CONFIG = define({
  version: 1,
  id: "default",
  weights: {
    identity_similarity: 1,
    vibe_similarity: 1,
    key_relation: 0.02,
    bpm_distance: 0.01,
  },
  base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
  usePrior: true,
  constraints: {
    bpm_window: { unit: "ratio", max: 0.06 },
    key_rule: { metric: "wheel", max: 1 },
  },
});

/**
 * The pre-scorer's modes. Their hard constraints are carried over exactly;
 * of their bonuses, genre overlap (0.08) and era (0.02 same, 0.01 adjacent)
 * are linear and carried over exactly. Its stepped BPM and key bonuses and
 * the energy penalty aren't linear in a normalised signal, so the modes use
 * the default's key and tempo weights instead (see the PR for #1191).
 */
const modeWeights = {
  ...DEFAULT_RANKING_CONFIG.weights,
  genre_overlap: TAG_BONUS_WEIGHT,
  era: 0.02,
};

export const BLEND_RANKING_CONFIG = define({
  version: 1,
  id: "blend",
  weights: modeWeights,
  base: DEFAULT_RANKING_CONFIG.base,
  usePrior: true,
  constraints: { bpm_window: { unit: "bpm", max: 12 } },
});

export const MIXABLE_RANKING_CONFIG = define({
  version: 1,
  id: "mixable",
  weights: modeWeights,
  base: DEFAULT_RANKING_CONFIG.base,
  usePrior: true,
  constraints: {
    bpm_window: { unit: "bpm", max: 6 },
    key_rule: { metric: "camelot", max: 2 },
  },
});

export const STRICT_RANKING_CONFIG = define({
  version: 1,
  id: "strict",
  weights: modeWeights,
  base: DEFAULT_RANKING_CONFIG.base,
  usePrior: true,
  constraints: {
    bpm_window: { unit: "bpm", max: 4 },
    key_rule: { metric: "camelot", max: 1 },
    genre_floor: { min: MIN_GENRE_OVERLAP },
  },
});

/**
 * Beatmatcher (#1192): mixable first. Tempo and key outweigh similarity: in
 * the ±6% window (half and double time allowed) the tempo signal spreads up
 * to 0.36 and the key up to 0.3, against at most 0.5 from the similarity
 * base, which mostly breaks ties. Genre and energy are faint pulls.
 */
export const BEATMATCHER_RANKING_CONFIG = define({
  version: 1,
  id: "beatmatcher",
  weights: {
    identity_similarity: 0.5,
    vibe_similarity: 0.5,
    key_relation: 0.3,
    bpm_distance: 3,
    genre_overlap: 0.05,
    energy: 0.05,
  },
  base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
  usePrior: true,
  constraints: {
    bpm_window: { unit: "ratio", max: 0.06, half_double: true },
    key_rule: { metric: "wheel", max: 1 },
  },
});

/**
 * Selector (#1192): the vibe first. Audio vibe leads the base (identity
 * counts at 0.8), genre overlap adds up to 0.3, era and energy pull gently,
 * tempo barely registers and key not at all. No hard constraints.
 */
export const SELECTOR_RANKING_CONFIG = define({
  version: 1,
  id: "selector",
  weights: {
    identity_similarity: 0.8,
    vibe_similarity: 1,
    genre_overlap: 0.3,
    era: 0.05,
    energy: 0.08,
    bpm_distance: 0.01,
  },
  base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
  usePrior: true,
  constraints: {},
});

export const RANKING_CONFIGS: Record<RankingConfigId, RankingConfig> = {
  default: DEFAULT_RANKING_CONFIG,
  blend: BLEND_RANKING_CONFIG,
  mixable: MIXABLE_RANKING_CONFIG,
  strict: STRICT_RANKING_CONFIG,
};

/** The config each surface ranks with when nothing is chosen, or a choice can't be read (#1192). */
export const DEFAULT_CONFIG_BY_SURFACE: Record<RankingSurface, RankingConfig> = {
  suggestions: DEFAULT_RANKING_CONFIG,
  related: DEFAULT_RANKING_CONFIG,
  recommendations: DEFAULT_RANKING_CONFIG,
  playlists: DEFAULT_RANKING_CONFIG,
};

export type SuggestionFilterToggles = { compatibleKey?: boolean; bpmWithinSixPercent?: boolean };

const trimNumber = (value: number) => String(Number(value.toFixed(2)));

/**
 * The panels' toggle labels for a config's own constraints; null where the
 * config has none, so the toggle is hidden. Default reads "Compatible key"
 * and "BPM ±6%", as before profiles.
 */
export function suggestionFilterLabels(config: RankingConfig): {
  compatibleKey: string | null;
  bpmWithinSixPercent: string | null;
} {
  const { key_rule, bpm_window } = config.constraints;
  let bpm: string | null = null;
  if (bpm_window) {
    bpm =
      bpm_window.unit === "ratio"
        ? `BPM ±${trimNumber(bpm_window.max * 100)}%`
        : `BPM ±${trimNumber(bpm_window.max)}`;
    if (bpm_window.half_double) bpm += " ½×/2×";
  }
  const sameKey = key_rule && key_rule.max === 0;
  return {
    compatibleKey: key_rule ? (sameKey ? "Same key" : "Compatible key") : null,
    bpmWithinSixPercent: bpm,
  };
}

/**
 * The suggestion panels' toggles switch the config's own constraints on and
 * off; they never carry a value of their own. Off (or omitted) drops it.
 */
export function withSuggestionFilters(
  config: RankingConfig,
  filters: SuggestionFilterToggles,
): RankingConfig {
  return {
    ...config,
    constraints: {
      ...config.constraints,
      key_rule: filters.compatibleKey ? (config.constraints.key_rule ?? null) : null,
      bpm_window: filters.bpmWithinSixPercent ? (config.constraints.bpm_window ?? null) : null,
    },
  };
}
