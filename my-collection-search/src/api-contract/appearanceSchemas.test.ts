import { describe, expect, it } from "vitest";
import { customFromPreset } from "@/app/palettes/custom";
import { appearanceSettingsPutBodySchema, appearanceSettingsResponseSchema } from "./schemas";

const custom = customFromPreset("sleeve");
const fonts = { display: "default", body: "default", label: "default" };

describe("appearance schemas", () => {
  it("keeps the original bodies working", () => {
    expect(appearanceSettingsPutBodySchema.safeParse({ palette: "riso" }).success).toBe(true);
    expect(appearanceSettingsPutBodySchema.safeParse({ fonts: { body: "inter" } }).success).toBe(
      true,
    );
    expect(appearanceSettingsPutBodySchema.safeParse({}).success).toBe(true);
  });

  it("round-trips a custom palette, lowercasing the hex", () => {
    const upper = structuredClone(custom);
    upper.dark.shadow = upper.dark.shadow.toUpperCase();
    expect(upper.dark.shadow).not.toBe(custom.dark.shadow);
    const parsed = appearanceSettingsPutBodySchema.parse({
      palette: "custom",
      customPalette: upper,
    });
    expect(parsed.customPalette).toEqual(custom);
  });

  it("accepts null to delete, but not together with palette custom", () => {
    expect(appearanceSettingsPutBodySchema.safeParse({ customPalette: null }).success).toBe(true);
    expect(
      appearanceSettingsPutBodySchema.safeParse({ palette: "custom", customPalette: null }).success,
    ).toBe(false);
  });

  it.each(["red;}body{display:none", "url(x)", "#fff", "rgba(0,0,0,.5)"])("rejects %j", (bad) => {
    const body = structuredClone(custom);
    body.light.ground = bad;
    expect(appearanceSettingsPutBodySchema.safeParse({ customPalette: body }).success).toBe(false);
  });

  it("rejects unknown keys and an unknown base", () => {
    expect(
      appearanceSettingsPutBodySchema.safeParse({ customPalette: { ...custom, css: "x" } }).success,
    ).toBe(false);
    expect(
      appearanceSettingsPutBodySchema.safeParse({ customPalette: { ...custom, base: "x" } })
        .success,
    ).toBe(false);
  });

  it("responds with the palette inputs or null", () => {
    expect(
      appearanceSettingsResponseSchema.parse({ palette: "custom", fonts, customPalette: custom })
        .customPalette,
    ).toEqual(custom);
    expect(
      appearanceSettingsResponseSchema.parse({ palette: "sleeve", fonts, customPalette: null })
        .customPalette,
    ).toBeNull();
  });
});
