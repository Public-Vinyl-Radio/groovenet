import {
  APPEARANCE_CORNERS,
  APPEARANCE_FONT_CHOICES,
  APPEARANCE_PALETTE_IDS,
} from "@groovenet/contracts";
import { describe, expect, it } from "vitest";
import { cornerIds } from "@/app/corners";
import { fontChoiceIdsFor, fontRoleIds } from "@/app/fontChoices";
import { paletteIds } from "@/app/palettes";
import { appearanceSettingsPutBodySchema } from "../schemas";

// The contracts package cannot import the app's registries, so it lists the ids
// itself; this fails when a palette, corner style or font is added to only one.
describe("appearance ids shared with @groovenet/contracts", () => {
  it("lists the app's palettes", () => {
    expect([...APPEARANCE_PALETTE_IDS]).toEqual([...paletteIds]);
  });

  it("lists the app's corner styles", () => {
    expect([...APPEARANCE_CORNERS]).toEqual([...cornerIds]);
  });

  it("lists the app's font roles and the faces each accepts", () => {
    expect(Object.keys(APPEARANCE_FONT_CHOICES)).toEqual([...fontRoleIds]);
    for (const role of fontRoleIds) {
      expect([...APPEARANCE_FONT_CHOICES[role]]).toEqual(fontChoiceIdsFor(role));
    }
  });
});

describe("appearanceSettingsPutBodySchema", () => {
  const colours = {
    ground: "#F4EDE0",
    surface: "#fbf7ee",
    ink: "#1f1a17",
    accent: "#c8321a",
    shadow: "#4a3a2e",
  };

  it("lowercases custom palette colours", () => {
    const parsed = appearanceSettingsPutBodySchema.parse({
      customPalette: { base: "sleeve", light: colours, dark: colours },
    });
    expect(parsed.customPalette?.light.ground).toBe("#f4ede0");
  });

  it("rejects custom without a custom palette", () => {
    const parsed = appearanceSettingsPutBodySchema.safeParse({
      palette: "custom",
      customPalette: null,
    });
    expect(parsed.success).toBe(false);
  });
});
