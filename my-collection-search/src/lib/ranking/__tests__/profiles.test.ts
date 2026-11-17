import { describe, expect, it } from "vitest";
import {
  rankingConfigSchema,
  rankingProfileSchema,
  toRankingConfig,
  type RankingConfig,
} from "@groovenet/contracts";
import {
  BEATMATCHER_RANKING_CONFIG,
  DEFAULT_RANKING_CONFIG,
  SELECTOR_RANKING_CONFIG,
  suggestionFilterLabels,
} from "../configs";
import {
  copyName,
  DEFAULT_PROFILE,
  draftToStored,
  isPresetId,
  parseStoredProfile,
  PRESET_LIST,
  profileAnalyticsId,
  profileToDraft,
  RANKING_PRESETS,
  resolveProfile,
  storedProfileEntry,
  type StoredRankingProfile,
} from "../profiles";

const row = (overrides: Partial<StoredRankingProfile> = {}): StoredRankingProfile => ({
  id: 7,
  name: "Late night",
  description: "Slow it down",
  surfaces: ["suggestions"],
  version: 2,
  config: {
    weights: { vibe_similarity: 1, energy: 0.2 },
    usePrior: true,
    constraints: { energy_range: { max_drop: 0.3, max_rise: 0 } },
  },
  ...overrides,
});

describe("presets", () => {
  it("are Default, Beatmatcher and Selector, read-only presets for every surface", () => {
    expect(PRESET_LIST.map((p) => p.id)).toEqual(["default", "beatmatcher", "selector"]);
    for (const preset of PRESET_LIST) {
      expect(preset.kind).toBe("preset");
      expect(preset.surfaces).toEqual(["suggestions", "related", "recommendations", "playlists"]);
      expect(rankingProfileSchema.parse(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
    }
    expect(toRankingConfig(RANKING_PRESETS.beatmatcher)).toEqual(BEATMATCHER_RANKING_CONFIG);
    expect(toRankingConfig(RANKING_PRESETS.selector)).toEqual(SELECTOR_RANKING_CONFIG);
    expect(toRankingConfig(DEFAULT_PROFILE)).toEqual(DEFAULT_RANKING_CONFIG);
  });

  it("recognises preset ids only", () => {
    expect(isPresetId("selector")).toBe(true);
    expect(isPresetId("strict")).toBe(false);
    expect(isPresetId("toString")).toBe(false);
  });
});

describe("stored profiles", () => {
  it("parse into a custom profile", () => {
    expect(parseStoredProfile(row())).toMatchObject({
      id: "7",
      kind: "custom",
      name: "Late night",
      surfaces: ["suggestions"],
      constraints: { energy_range: { max_drop: 0.3, max_rise: 0 } },
    });
  });

  it.each([
    ["a non-object config", { config: "nope" }],
    ["an array config", { config: [] }],
    ["a null config", { config: null }],
    ["an unknown signal", { config: { weights: { plays: 1 } } }],
    ["a huge weight", { config: { weights: { rating: 1e9 } } }],
    ["an extra field", { config: { weights: {}, script: "x" } }],
    ["a future version", { version: 3 }],
    ["a v1 row the #1218 migration missed", { version: 1 }],
    ["bad surfaces", { surfaces: "suggestions" }],
    ["an empty name", { name: "  " }],
  ])("are null with %s", (_label, overrides) => {
    expect(parseStoredProfile(row(overrides as Partial<StoredRankingProfile>))).toBeNull();
  });

  it("list an unreadable row as Default under its own name, marked invalid", () => {
    const entry = storedProfileEntry(row({ config: { weights: { plays: 1 } } }));
    expect(entry).toMatchObject({ id: "7", name: "Late night", kind: "custom", invalid: true });
    expect(toRankingConfig(entry)).toEqual({ ...DEFAULT_RANKING_CONFIG, id: "7" });
    expect(storedProfileEntry(row({ name: "", version: 9 })).name).toBe("Unreadable");
    expect(storedProfileEntry(row({ name: "x".repeat(200), version: 9 })).name).toHaveLength(80);
    expect(storedProfileEntry(row()).invalid).toBeUndefined();
  });

  it("round-trip through the stored columns", () => {
    const draft = profileToDraft(RANKING_PRESETS.beatmatcher, "Mine");
    const stored = draftToStored(draft);
    expect(stored).toMatchObject({ name: "Mine", version: 2 });
    expect(stored.config).not.toHaveProperty("name");
    const back = parseStoredProfile({ id: 3, ...stored });
    expect(back && toRankingConfig(back)).toEqual({ ...BEATMATCHER_RANKING_CONFIG, id: "3" });
    const noBase = draftToStored({ ...draft, base: undefined });
    expect(noBase.config).not.toHaveProperty("base");
  });

  it("copies keep a name within the limit", () => {
    expect(copyName("Selector")).toBe("Selector copy");
    expect(copyName("x".repeat(80))).toHaveLength(80);
    expect(profileToDraft(RANKING_PRESETS.selector).name).toBe("Selector");
    const entry = storedProfileEntry(row({ version: 9 }));
    expect(profileToDraft(entry)).not.toHaveProperty("invalid");
    expect(profileToDraft(entry)).not.toHaveProperty("id");
    expect(profileToDraft({ ...entry, base: undefined })).not.toHaveProperty("base");
  });
});

describe("resolveProfile", () => {
  const stored = [storedProfileEntry(row()), storedProfileEntry(row({ id: 8, version: 5 }))];

  it("finds presets and stored profiles", () => {
    expect(resolveProfile("beatmatcher", stored)).toMatchObject({
      profile: { id: "beatmatcher" },
      fallback: false,
    });
    const mine = resolveProfile("7", stored, "suggestions");
    expect(mine.fallback).toBe(false);
    expect(mine.config.id).toBe("7");
  });

  it("is Default for nothing chosen, without a fallback", () => {
    for (const id of [null, undefined, "", "default"]) {
      expect(resolveProfile(id, stored)).toMatchObject({
        profile: { id: "default" },
        fallback: false,
      });
    }
  });

  it("falls back to Default for unknown, invalid or off-surface profiles", () => {
    for (const [id, surface] of [
      ["99", undefined],
      ["8", undefined],
      ["7", "related"],
      ["gone-preset", undefined],
    ] as const) {
      const result = resolveProfile(id, stored, surface);
      expect(result.fallback).toBe(true);
      expect(result.config).toEqual(DEFAULT_RANKING_CONFIG);
    }
  });
});

describe("profileAnalyticsId", () => {
  it("sends a preset's id or custom, never a name", () => {
    expect(profileAnalyticsId(RANKING_PRESETS.selector)).toBe("selector");
    expect(profileAnalyticsId({ id: "7", kind: "custom" })).toBe("custom");
    expect(profileAnalyticsId({ id: "beatmatcher", kind: "custom" })).toBe("custom");
    expect(profileAnalyticsId({ id: "3", kind: "preset" })).toBe("custom");
  });
});

describe("suggestionFilterLabels", () => {
  const withConstraints = (constraints: RankingConfig["constraints"]) =>
    rankingConfigSchema.parse({ version: 2, id: "x", weights: {}, constraints });

  it("reads Default's toggles as before", () => {
    expect(suggestionFilterLabels(DEFAULT_RANKING_CONFIG)).toEqual({
      compatibleKey: "Compatible key",
      bpmWithinSixPercent: "BPM ±6%",
    });
  });

  it("names each profile's own window and key rule", () => {
    expect(suggestionFilterLabels(BEATMATCHER_RANKING_CONFIG).bpmWithinSixPercent).toBe(
      "BPM ±6% ½×/2×",
    );
    expect(
      suggestionFilterLabels(
        withConstraints({
          bpm_window: { unit: "bpm", max: 4.5 },
          key_rule: { metric: "wheel", max: 0 },
        }),
      ),
    ).toEqual({ compatibleKey: "Same key", bpmWithinSixPercent: "BPM ±4.5" });
    expect(
      suggestionFilterLabels(withConstraints({ bpm_window: { unit: "ratio", max: 0.125 } }))
        .bpmWithinSixPercent,
    ).toBe("BPM ±12.5%");
  });

  it("hides toggles the profile has no constraint for", () => {
    expect(suggestionFilterLabels(SELECTOR_RANKING_CONFIG)).toEqual({
      compatibleKey: null,
      bpmWithinSixPercent: null,
    });
  });
});
