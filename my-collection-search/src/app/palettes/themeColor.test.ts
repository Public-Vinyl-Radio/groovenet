import { describe, expect, it } from "vitest";
import { palettes } from "./index";
import { customFromPreset } from "./custom";
import { paletteGround } from "./themeColor";

describe("paletteGround", () => {
  it.each(Object.keys(palettes) as (keyof typeof palettes)[])("is the %s ground in each mode", (id) => {
    expect(paletteGround(id, null)).toEqual({
      light: palettes[id].light["--gn-ground"],
      dark: palettes[id].dark["--gn-ground"],
    });
  });

  it("uses the custom palette's own grounds", () => {
    const custom = customFromPreset("riso");
    custom.light.ground = "#aabbcc";
    custom.dark.ground = "#112233";
    expect(paletteGround("custom", custom)).toEqual({ light: "#aabbcc", dark: "#112233" });
  });

  it("falls back to the default palette when custom is named without one", () => {
    expect(paletteGround("custom", null)).toEqual(paletteGround("sleeve", null));
  });
});
