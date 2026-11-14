import { describe, expect, it } from "vitest";
import {
  keyRuleForMode,
  keyRuleMode,
  MAX_RANKING_PROFILES_PER_FRIEND,
  rankingActiveUpdateSchema,
  rankingConfigSchema,
  rankingJsonSchemas,
  rankingProfileCopySchema,
  rankingProfileCreateSchema,
  rankingProfileDraftSchema,
  rankingProfileSchema,
  rankingProfilesResponseSchema,
  rankingRefSchema,
  storedRankingProfileIdSchema,
  toRankingConfig,
} from "./ranking.js";
import { recommendationsQuerySchema, recommendationsResponseSchema } from "./recommendations.js";

const config = { version: 1, id: "x", weights: { bpm_distance: 1 } } as const;

const draft = {
  version: 1,
  name: "Warm-up",
  surfaces: ["suggestions", "related"],
  weights: { vibe_similarity: 1, energy: 0.1 },
  constraints: { energy_range: { max_drop: 0.1, max_rise: 0.2 } },
};

describe("new constraints", () => {
  it("accepts half and double time on the BPM window, off when omitted", () => {
    const withRule = rankingConfigSchema.parse({
      ...config,
      constraints: { bpm_window: { unit: "ratio", max: 0.06, half_double: true } },
    });
    expect(withRule.constraints.bpm_window).toEqual({
      unit: "ratio",
      max: 0.06,
      half_double: true,
    });
    const without = rankingConfigSchema.parse({
      ...config,
      constraints: { bpm_window: { unit: "ratio", max: 0.06 } },
    });
    expect(without.constraints.bpm_window).toEqual({ unit: "ratio", max: 0.06 });
  });

  it("accepts an energy range and a null one", () => {
    for (const energy_range of [{ max_drop: 0, max_rise: 1 }, null]) {
      expect(
        rankingConfigSchema.parse({ ...config, constraints: { energy_range } }).constraints,
      ).toEqual({ energy_range });
    }
  });

  it.each([
    { energy_range: { max_drop: -0.1, max_rise: 0.1 } },
    { energy_range: { max_drop: 0.1, max_rise: 1.5 } },
    { energy_range: { max_drop: 0.1 } },
    { energy_range: { max_drop: 0.1, max_rise: 0.1, extra: 1 } },
    { bpm_window: { unit: "ratio", max: 0.06, half_double: "yes" } },
    { bpm_window: { unit: "ratio", max: 0.06, nested: { deep: { deeper: {} } } } },
    { key_rule: { metric: "wheel", max: 1, also: true } },
    { genre_floor: { min: 0.1, x: 1 } },
    { tempo: { max: 1 } },
  ])("rejects an invalid constraint %#", (constraints) => {
    expect(rankingConfigSchema.safeParse({ ...config, constraints }).success).toBe(false);
  });
});

describe("key rule modes", () => {
  it("maps same, adjacent and any onto key_rule and back", () => {
    expect(keyRuleForMode("same")).toEqual({ metric: "wheel", max: 0 });
    expect(keyRuleForMode("adjacent")).toEqual({ metric: "wheel", max: 1 });
    expect(keyRuleForMode("any")).toBeNull();
    for (const mode of ["same", "adjacent", "any"] as const) {
      expect(keyRuleMode(keyRuleForMode(mode))).toBe(mode);
    }
    expect(keyRuleMode(undefined)).toBe("any");
    expect(keyRuleMode({ metric: "camelot", max: 2 })).toBe("custom");
    expect(keyRuleMode({ metric: "wheel", max: 3 })).toBe("custom");
  });
});

describe("ranking profiles", () => {
  it("is a config plus its metadata", () => {
    const profile = rankingProfileSchema.parse({ ...draft, id: "12", kind: "custom" });
    expect(profile).toMatchObject({ id: "12", kind: "custom", description: "", usePrior: false });
    expect(toRankingConfig(profile)).toEqual({
      version: 1,
      id: "12",
      weights: draft.weights,
      usePrior: false,
      constraints: draft.constraints,
    });
    expect(rankingConfigSchema.parse(toRankingConfig(profile))).toEqual(toRankingConfig(profile));
  });

  it("keeps a base in the config it hands the ranker", () => {
    const base = { combine: "max", signals: ["vibe_similarity"] } as const;
    const profile = rankingProfileSchema.parse({
      ...draft,
      base,
      id: "beatmatcher",
      kind: "preset",
    });
    expect(toRankingConfig(profile).base).toEqual(base);
  });

  it("trims names and descriptions", () => {
    expect(
      rankingProfileDraftSchema.parse({ ...draft, name: "  Peak  ", description: " late " }),
    ).toMatchObject({ name: "Peak", description: "late" });
  });

  it.each([
    ["no name", { ...draft, name: "   " }],
    ["a long name", { ...draft, name: "x".repeat(81) }],
    ["a long description", { ...draft, description: "x".repeat(501) }],
    ["no surfaces", { ...draft, surfaces: [] }],
    ["a repeated surface", { ...draft, surfaces: ["related", "related"] }],
    ["an unknown surface", { ...draft, surfaces: ["search"] }],
    ["an unknown signal", { ...draft, weights: { plays: 1 } }],
    ["a huge weight", { ...draft, weights: { bpm_distance: 1e308 } }],
    ["an infinite weight", { ...draft, weights: { bpm_distance: Infinity } }],
    ["a string weight", { ...draft, weights: { bpm_distance: "1" } }],
    ["a huge window", { ...draft, constraints: { bpm_window: { unit: "bpm", max: 1e9 } } }],
    ["an extra field", { ...draft, owner: "me" }],
    ["a deep object", { ...draft, extra: { a: { b: { c: { d: {} } } } } }],
    ["an id in the draft", { ...draft, id: "5" }],
    ["a kind in the draft", { ...draft, kind: "custom" }],
    ["a future version", { ...draft, version: 2 }],
    ["an extra base field", { ...draft, base: { combine: "max", signals: [], x: 1 } }],
  ])("rejects a draft with %s", (_label, value) => {
    expect(rankingProfileDraftSchema.safeParse(value).success).toBe(false);
  });

  it.each(["default", "beatmatcher", "selector", "1", "2147483647"])("accepts the id %s", (id) => {
    expect(rankingProfileSchema.safeParse({ ...draft, id, kind: "custom" }).success).toBe(true);
  });

  it.each(["blend", "0", "01", "2147483648", "12345678901", "-1", "Beatmatcher", ""])(
    "rejects the profile id %s",
    (id) => {
      expect(rankingProfileSchema.safeParse({ ...draft, id, kind: "custom" }).success).toBe(false);
    },
  );

  it("names a ranking by preset, built-in config or stored id", () => {
    for (const ref of ["default", "selector", "strict", "42"]) {
      expect(rankingRefSchema.parse(ref)).toBe(ref);
    }
    expect(rankingRefSchema.safeParse("nope").success).toBe(false);
    expect(storedRankingProfileIdSchema.safeParse("7").success).toBe(true);
  });

  it("validates the create, copy and active requests", () => {
    expect(rankingProfileCreateSchema.safeParse({ friend_id: 1, profile: draft }).success).toBe(
      true,
    );
    expect(
      rankingProfileCreateSchema.safeParse({ friend_id: 1, profile: draft, x: 1 }).success,
    ).toBe(false);
    expect(rankingProfileCopySchema.parse({ friend_id: 1 })).toEqual({ friend_id: 1 });
    expect(rankingProfileCopySchema.safeParse({ friend_id: 1, name: "" }).success).toBe(false);
    expect(
      rankingActiveUpdateSchema.parse({ friend_id: 1, profile_id: "beatmatcher" }),
    ).toMatchObject({ profile_id: "beatmatcher" });
    expect(
      rankingActiveUpdateSchema.safeParse({ friend_id: 1, profile_id: "strict" }).success,
    ).toBe(false);
    expect(
      rankingActiveUpdateSchema.safeParse({ friend_id: 1, profile_id: "3", surfaces: [] }).success,
    ).toBe(false);
  });

  it("lists profiles with an invalid flag and the active ones", () => {
    const profile = rankingProfileSchema.parse({ ...draft, id: "3", kind: "custom" });
    const parsed = rankingProfilesResponseSchema.parse({
      friend_id: 1,
      profiles: [{ ...profile, invalid: true }],
      active: { suggestions: "3", related: "default", recommendations: "default" },
    });
    expect(parsed.profiles[0].invalid).toBe(true);
    expect(MAX_RANKING_PROFILES_PER_FRIEND).toBe(50);
  });

  it("publishes JSON schemas for every request and response", () => {
    expect(Object.keys(rankingJsonSchemas)).toEqual([
      "RankingConfig",
      "RankingProfile",
      "RankingProfileDraft",
      "RankingProfilesResponse",
      "RankingProfileCreateRequest",
      "RankingProfileUpdateRequest",
      "RankingProfileCopyRequest",
      "RankingActiveUpdateRequest",
      "RankingActiveResponse",
      "RankingProfileDeleteResponse",
    ]);
    expect(rankingJsonSchemas.RankingProfileDraft).toMatchObject({
      additionalProperties: false,
    });
  });
});

describe("recommendations ranked by a profile", () => {
  it("accepts a stored profile id as the ranker", () => {
    expect(
      recommendationsQuerySchema.parse({ track_id: "t", friend_id: 1, ranker: "17" }).ranker,
    ).toBe("17");
    expect(
      recommendationsQuerySchema.safeParse({ track_id: "t", friend_id: 1, ranker: "x y" }).success,
    ).toBe(false);
  });

  it("reports which profile ranked and whether it fell back", () => {
    const response = recommendationsResponseSchema.parse({
      seedTrackId: "t",
      seedFriendId: 1,
      seedEmbeddings: { identity: true, audio: true },
      scope: "library",
      libraryFriendId: 1,
      candidates: [],
      stats: {
        identityCount: 0,
        audioCount: 0,
        unionCount: 0,
        timingMs: { identityQuery: 0, audioQuery: 0, total: 0 },
      },
      ranking: {
        config: "17",
        surface: "recommendations",
        fallback: true,
        seed: { trackId: "t", friendId: 1 },
      },
    });
    expect(response.ranking).toMatchObject({ config: "17", fallback: true });
  });
});
