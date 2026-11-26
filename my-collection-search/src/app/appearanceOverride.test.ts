import { describe, expect, it } from "vitest";
import {
  appearanceOverrideKey,
  emptyOverride,
  isEmptyOverride,
  mergeOverride,
  overriddenFields,
  parseAppearanceOverride,
  resolveAppearance,
  serializeOverride,
} from "./appearanceOverride";
import { customFromPreset } from "./palettes/custom";

const saved = {
  palette: "riso",
  corners: "rounded",
  fonts: { display: "zilla-slab", body: "inter", label: "system" },
  customPalette: null,
};
const stored = (value: unknown) => JSON.stringify({ v: 1, ...(value as object) });

describe("parseAppearanceOverride", () => {
  it("is empty for missing, corrupt, non-object and wrong-version storage", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "{",
      "null",
      "[]",
      "3",
      '"x"',
      '{"v":2,"palette":"riso"}',
    ]) {
      expect(parseAppearanceOverride(raw)).toEqual(emptyOverride);
    }
  });

  it("keeps valid fields and drops each invalid one alone", () => {
    const parsed = parseAppearanceOverride(
      stored({
        palette: "gone",
        corners: "rounded",
        fonts: { display: "barlow-condensed", body: "papyrus", label: 3, other: "x" },
      }),
    );
    expect(parsed).toEqual({ corners: "rounded", fonts: { display: "barlow-condensed" } });
  });

  it("rejects another role's font id", () => {
    expect(parseAppearanceOverride(stored({ fonts: { display: "inter" } }))).toEqual(emptyOverride);
  });

  it("rejects a font table that isn't an object", () => {
    expect(parseAppearanceOverride(stored({ fonts: ["inter"] }))).toEqual(emptyOverride);
  });

  it("accepts a valid custom palette and drops one with a non-hex colour", () => {
    const custom = customFromPreset("midnight");
    expect(parseAppearanceOverride(stored({ customPalette: custom })).customPalette).toEqual(
      custom,
    );
    const bad = { ...custom, light: { ...custom.light, ink: "red;}body{display:none" } };
    expect(parseAppearanceOverride(stored({ customPalette: bad })).customPalette).toBeUndefined();
  });

  it("accepts an already-parsed object", () => {
    expect(parseAppearanceOverride({ v: 1, corners: "square" })).toEqual({ corners: "square" });
  });
});

describe("resolveAppearance", () => {
  it("is the saved value when nothing is overridden", () => {
    expect(resolveAppearance(saved)).toEqual({
      palette: "riso",
      corners: "rounded",
      fonts: saved.fonts,
      localFonts: {},
      customPalette: null,
    });
  });

  it("prefers the override per field, then the saved value, then the default", () => {
    const resolved = resolveAppearance(
      { palette: "riso", fonts: { display: "nonsense" } },
      { palette: "mono", fonts: { body: "plex-mono" } },
    );
    expect(resolved.palette).toBe("mono");
    expect(resolved.corners).toBe("square");
    expect(resolved.fonts).toEqual({ display: "default", body: "plex-mono", label: "default" });
  });

  it("keeps an override over a changed saved default", () => {
    const override = { palette: "mono" as const };
    expect(resolveAppearance({ ...saved, palette: "midnight" }, override).palette).toBe("mono");
    expect(resolveAppearance({ ...saved, palette: "sleeve" }, override).palette).toBe("mono");
  });

  it("falls back to the saved palette for `custom` with nothing to render", () => {
    expect(resolveAppearance(saved, { palette: "custom" }).palette).toBe("riso");
  });

  it("uses the saved custom palette for an override of `custom`", () => {
    const custom = customFromPreset("sleeve");
    const resolved = resolveAppearance({ ...saved, customPalette: custom }, { palette: "custom" });
    expect(resolved.palette).toBe("custom");
    expect(resolved.customPalette).toEqual(custom);
  });

  it("prefers the device's own custom palette over the saved one", () => {
    const own = customFromPreset("mono");
    const resolved = resolveAppearance(
      { ...saved, customPalette: customFromPreset("sleeve") },
      { customPalette: own },
    );
    expect(resolved.customPalette).toEqual(own);
  });
});

describe("mergeOverride and serialize", () => {
  it("sets, clears and keeps fields", () => {
    let o = mergeOverride(emptyOverride, { palette: "riso", fonts: { body: "inter" } });
    o = mergeOverride(o, { corners: "rounded", fonts: { label: "system" } });
    expect(o).toEqual({
      palette: "riso",
      corners: "rounded",
      fonts: { body: "inter", label: "system" },
    });
    o = mergeOverride(o, { palette: null, corners: null, fonts: { body: null } });
    expect(o).toEqual({ fonts: { label: "system" } });
    o = mergeOverride(o, { fonts: { label: null } });
    expect(isEmptyOverride(o)).toBe(true);
    expect(o.fonts).toBeUndefined();
  });

  it("sets and clears a custom palette", () => {
    const custom = customFromPreset("sleeve");
    const o = mergeOverride(emptyOverride, { customPalette: custom });
    expect(o.customPalette).toEqual(custom);
    expect(mergeOverride(o, { customPalette: null }).customPalette).toBeUndefined();
  });

  it("round-trips through the stored text, with the custom CSS alongside", () => {
    const o = { palette: "custom" as const, customPalette: customFromPreset("sleeve") };
    const text = serializeOverride(o);
    expect(JSON.parse(text).customCss).toContain(':root[data-palette="custom"]');
    expect(parseAppearanceOverride(text)).toEqual(o);
    expect(JSON.parse(serializeOverride({ corners: "square" })).customCss).toBeUndefined();
    expect(appearanceOverrideKey).toBe("gn-appearance");
  });

  it("lists what is overridden", () => {
    expect(overriddenFields(emptyOverride)).toEqual([]);
    expect(
      overriddenFields({
        customPalette: customFromPreset("sleeve"),
        corners: "square",
        fonts: { label: "system" },
      }),
    ).toEqual(["palette", "corners", "font:label"]);
  });
});

describe("fonts installed on this device", () => {
  const { parse, merge } = {
    parse: parseAppearanceOverride,
    merge: mergeOverride,
  };

  it("reads a valid family per role and drops invalid ones alone", () => {
    expect(
      parse({
        v: 1,
        localFonts: { body: "Berkeley Mono", label: 'bad"; x', display: " Futura  PT ", nope: "X" },
      }).localFonts,
    ).toEqual({ body: "Berkeley Mono", display: "Futura PT" });
  });

  it.each(["x", null, [], 5])("ignores a non-table %j", (value) => {
    expect(parse({ v: 1, localFonts: value })).toEqual({});
  });

  it("lets the local font win over a stored choice for the same role only", () => {
    const parsed = parse({
      v: 1,
      fonts: { body: "inter", label: "system" },
      localFonts: { body: "Menlo" },
    });
    expect(parsed.fonts).toEqual({ label: "system" });
    expect(parse({ v: 1, fonts: { body: "inter" }, localFonts: { body: "Menlo" } }).fonts).toBe(
      undefined,
    );
  });

  it("is an override, and an overridden font field", () => {
    const override = parse({ v: 1, localFonts: { label: "Menlo" } });
    expect(isEmptyOverride(override)).toBe(false);
    expect(overriddenFields(override)).toEqual(["font:label"]);
  });

  it("sets and clears a family, trading places with a choice", () => {
    let o = merge({}, { localFonts: { body: "Menlo" } });
    expect(o.localFonts).toEqual({ body: "Menlo" });
    o = merge(o, { fonts: { body: "inter" } });
    expect(o.localFonts).toBeUndefined();
    expect(o.fonts).toEqual({ body: "inter" });
    o = merge(o, { localFonts: { body: "Menlo" } });
    expect(o.fonts).toBeUndefined();
    o = merge(o, { localFonts: { body: null } });
    expect(isEmptyOverride(o)).toBe(true);
  });

  it("refuses to store an unsafe family", () => {
    expect(merge({}, { localFonts: { body: 'x"; }' } })).toEqual({});
  });

  it("round-trips through the stored text", () => {
    const text = serializeOverride({ localFonts: { body: "Berkeley Mono" } });
    expect(parse(text).localFonts).toEqual({ body: "Berkeley Mono" });
  });

  it("resolves with the local font beside the underlying choice", () => {
    const resolved = resolveAppearance(
      { fonts: { body: "inter" } },
      { localFonts: { body: "Berkeley Mono" } },
    );
    expect(resolved.fonts.body).toBe("inter");
    expect(resolved.localFonts).toEqual({ body: "Berkeley Mono" });
  });
});
