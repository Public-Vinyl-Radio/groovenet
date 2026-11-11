import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CORNERS,
  APPEARANCE_FONT_CHOICES,
  APPEARANCE_PALETTE_IDS,
  GAMDL_ACTIONS,
  RECOMMENDATION_SCOPES,
  aiPromptSettingsUpdateSchema,
  appearanceSettingsSchema,
  appearanceSettingsUpdateSchema,
  gamdlActionRequestSchema,
  gamdlActionResponseSchema,
  gamdlSettingsChangesSchema,
  gamdlSettingsSchema,
  gamdlSettingsUpdateSchema,
  recommendationSettingsSchema,
  recommendationSettingsUpdateSchema,
  settingsJsonSchemas,
} from "./settings.js";

const colours = {
  ground: "#f4ede0",
  surface: "#fbf7ee",
  ink: "#1f1a17",
  accent: "#c8321a",
  shadow: "#4a3a2e",
};
const customPalette = { base: "sleeve", light: colours, dark: colours };

const gamdl = {
  id: 1,
  friend_id: 2,
  audio_quality: "best",
  audio_format: "m4a",
  save_cover: true,
  cover_format: "jpg",
  save_lyrics: false,
  lyrics_format: "lrc",
  overwrite_existing: false,
  skip_music_videos: true,
  max_retries: 3,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("settings contracts", () => {
  it("defaults an omitted AI prompt to empty and strips unknown fields", () => {
    expect(aiPromptSettingsUpdateSchema.parse({ friend_id: 1, extra: 1 })).toEqual({
      friend_id: 1,
      prompt: "",
    });
    expect(aiPromptSettingsUpdateSchema.safeParse({ prompt: "x" }).success).toBe(false);
  });

  it("limits the recommendation scope to library or all", () => {
    expect(RECOMMENDATION_SCOPES).toEqual(["library", "all"]);
    expect(recommendationSettingsUpdateSchema.safeParse({ friend_id: 1, scope: "x" }).success).toBe(
      false,
    );
    expect(
      recommendationSettingsSchema.parse({ friend_id: 1, scope: "all", isDefault: false }),
    ).toEqual({ friend_id: 1, scope: "all", isDefault: false });
  });

  it("validates appearance responses and per-role fonts", () => {
    const settings = {
      palette: "custom",
      fonts: { display: "zilla-slab", body: "inter", label: "system" },
      customPalette,
      corners: "rounded",
    };
    expect(appearanceSettingsSchema.parse(settings)).toEqual(settings);
    expect(
      appearanceSettingsSchema.safeParse({
        ...settings,
        fonts: { display: "inter", body: "inter", label: "system" },
      }).success,
    ).toBe(false);
    for (const body of ["plex-mono", "jetbrains-mono", "system-mono"]) {
      expect(
        appearanceSettingsSchema.safeParse({ ...settings, fonts: { ...settings.fonts, body } })
          .success,
      ).toBe(true);
    }
    expect(
      appearanceSettingsSchema.safeParse({
        ...settings,
        fonts: { ...settings.fonts, body: "zilla-slab" },
      }).success,
    ).toBe(false);
    expect(APPEARANCE_PALETTE_IDS).toContain("sleeve");
    expect(APPEARANCE_CORNERS).toEqual(["square", "rounded"]);
    expect(APPEARANCE_FONT_CHOICES.body).toEqual([
      "default",
      "inter",
      "plex-mono",
      "jetbrains-mono",
      "system-mono",
      "system",
    ]);
  });

  it("makes every appearance update field optional, rejects unknown keys and a custom palette-less custom", () => {
    expect(appearanceSettingsUpdateSchema.parse({})).toEqual({});
    expect(appearanceSettingsUpdateSchema.parse({ fonts: { body: "inter" } })).toEqual({
      fonts: { body: "inter" },
    });
    expect(appearanceSettingsUpdateSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(appearanceSettingsUpdateSchema.safeParse({ fonts: { extra: "x" } }).success).toBe(false);
    expect(appearanceSettingsUpdateSchema.safeParse({ palette: "neon" }).success).toBe(false);
    expect(
      appearanceSettingsUpdateSchema.safeParse({ customPalette: { ...customPalette, base: "x" } })
        .success,
    ).toBe(false);
    expect(
      appearanceSettingsUpdateSchema.safeParse({
        customPalette: { ...customPalette, dark: { ...colours, ink: "red" } },
      }).success,
    ).toBe(false);
    expect(
      appearanceSettingsUpdateSchema.safeParse({ palette: "custom", customPalette: null }).success,
    ).toBe(false);
    expect(appearanceSettingsUpdateSchema.safeParse({ customPalette: null }).success).toBe(true);
    expect(
      appearanceSettingsUpdateSchema.safeParse({ palette: "custom", customPalette }).success,
    ).toBe(true);
  });

  it("validates GAMDL settings and enum fields", () => {
    expect(gamdlSettingsSchema.parse(gamdl)).toEqual(gamdl);
    expect(gamdlSettingsSchema.safeParse({ ...gamdl, audio_quality: "ultra" }).success).toBe(false);
    expect(gamdlSettingsChangesSchema.parse({ max_retries: 5, junk: 1 })).toEqual({
      max_retries: 5,
    });
    expect(gamdlSettingsChangesSchema.safeParse({ lyrics_format: "txt" }).success).toBe(false);
    expect(gamdlSettingsUpdateSchema.safeParse({ audio_format: "mp3" }).success).toBe(false);
  });

  it("types the GAMDL actions and every response an action can return", () => {
    expect(GAMDL_ACTIONS).toHaveLength(4);
    expect(gamdlActionRequestSchema.safeParse({ action: "nope" }).success).toBe(false);
    expect(gamdlActionRequestSchema.parse({ action: "reset_settings", friend_id: 2 })).toEqual({
      action: "reset_settings",
      friend_id: 2,
    });
    for (const result of [
      { exists: false },
      { success: true, message: "Cookie file deleted successfully" },
      { success: true, message: "Settings reset to defaults", settings: gamdl },
      {
        success: false,
        message: "no",
        details: {
          gamdl_available: true,
          cookie_file_exists: true,
          cookie_file_valid: false,
          test_download_attempted: false,
          test_download_success: false,
        },
      },
    ]) {
      expect(gamdlActionResponseSchema.safeParse(result).success).toBe(true);
    }
  });

  it("publishes request bodies as their input shape", () => {
    const schemas = settingsJsonSchemas as Record<string, Record<string, unknown>>;
    expect(schemas.AiPromptSettingsUpdate.additionalProperties).toBeUndefined();
    expect(schemas.AiPromptSettingsUpdate.required).toEqual(["friend_id"]);
    expect(schemas.GamdlSettingsUpdate.additionalProperties).toBeUndefined();
    expect(schemas.RecommendationSettingsUpdate.required).toEqual(["friend_id", "scope"]);
    expect(schemas.AppearanceSettingsUpdate.additionalProperties).toBe(false);
    expect(schemas.AppearanceSettings.required).toEqual([
      "palette",
      "fonts",
      "customPalette",
      "corners",
    ]);
    expect(Object.keys(schemas.GamdlActionResponse)).toContain("anyOf");
  });
});
