import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import {
  checkContrast,
  contrastFailures,
  customFromPreset,
  customPaletteCss,
  customPaletteId,
  derivePalette,
  isHexColour,
  mixHex,
  parseCustomPalette,
  resolveAppearancePalette,
  type CustomColours,
  type CustomPalette,
} from "./custom";
import { paletteIds, paletteVariableNames, palettes } from "./index";

const modes = ["light", "dark"] as const;
const HEX = /^#[0-9a-f]{6}$/;

describe("mixHex", () => {
  it("mixes in sRGB and rounds", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("derivePalette", () => {
  const sleeve = customFromPreset("sleeve");

  it("reproduces known outputs for the Sleeve inputs", () => {
    const { light, dark } = derivePalette(sleeve);
    expect(light["--gn-ink-muted"]).toBe("#5f5953");
    expect(light["--gn-border"]).toBe("#8a847c");
    expect(light["--gn-accent-contrast"]).toBe("#f4ede0");
    expect(light["--gn-accent-subtle"]).toBe("#edcfc0");
    expect(light["--gn-accent-fg"]).toBe("#aa2e19");
    expect(dark["--gn-accent-fg"]).toBe("#e96044");
    expect(dark["--gn-ground"]).toBe("#17130f");
    expect(dark["--gn-accent-solid"]).toBe("#e8573a");
  });

  it("keeps the preset's status colours unchanged", () => {
    const custom: CustomPalette = {
      ...sleeve,
      base: "midnight",
    };
    const derived = derivePalette(custom);
    for (const mode of modes) {
      for (const name of paletteVariableNames.filter((n) => n.startsWith("--gn-status-"))) {
        expect(derived[mode][name]).toBe(palettes.midnight[mode][name]);
      }
    }
  });

  it("never changes what the user typed", () => {
    const custom: CustomPalette = {
      base: "riso",
      light: {
        ground: "#808080",
        surface: "#828282",
        ink: "#858585",
        accent: "#777777",
        shadow: "#101010",
      },
      dark: sleeve.dark,
    };
    const { light } = derivePalette(custom);
    expect(light["--gn-ground"]).toBe("#808080");
    expect(light["--gn-surface"]).toBe("#828282");
    expect(light["--gn-ink"]).toBe("#858585");
    expect(light["--gn-accent-solid"]).toBe("#777777");
    expect(light["--gn-shadow"]).toBe("#101010");
  });

  it("is deterministic", () => {
    expect(derivePalette(sleeve)).toEqual(derivePalette(structuredClone(sleeve)));
  });

  it("pulls derived colours up to the thresholds when the inputs allow", () => {
    // Pale accent on a pale ground: the accent text and the rings must darken.
    const pale: CustomColours = {
      ground: "#ffffff",
      surface: "#f5f5f5",
      ink: "#111111",
      accent: "#ffd0c0",
      shadow: "#333333",
    };
    const { light } = derivePalette({ base: "sleeve", light: pale, dark: sleeve.dark });
    expect(contrastRatio(light["--gn-accent-fg"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(light["--gn-accent-fg"], light["--gn-accent-subtle"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light["--gn-accent-focus-ring"], "#f5f5f5")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(light["--gn-border"], "#f5f5f5")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(light["--gn-ink-muted"], "#f5f5f5")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light["--gn-accent-contrast"], "#ffd0c0")).toBeGreaterThanOrEqual(4.5);
  });

  it("always outputs every variable as #rrggbb", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const colour = () =>
      `#${Math.floor(rand() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;
    const colours = (): CustomColours => ({
      ground: colour(),
      surface: colour(),
      ink: colour(),
      accent: colour(),
      shadow: colour(),
    });
    for (let i = 0; i < 200; i++) {
      const base = paletteIds[i % paletteIds.length];
      const derived = derivePalette({ base, light: colours(), dark: colours() });
      for (const mode of modes) {
        expect(Object.keys(derived[mode]).sort()).toEqual([...paletteVariableNames].sort());
        for (const value of Object.values(derived[mode])) expect(value).toMatch(HEX);
      }
    }
  });
});

describe.each(paletteIds)("a custom palette copied from %s", (id) => {
  it("passes every AA pair the preset passes", () => {
    const custom = customFromPreset(id);
    const derived = derivePalette(custom);
    for (const mode of modes) {
      const presetFailing = new Set(
        checkContrast(palettes[id][mode])
          .filter((c) => !c.pass)
          .map((c) => `${c.fg}|${c.bg}`),
      );
      const failing = checkContrast(derived[mode]).filter(
        (c) => !c.pass && !presetFailing.has(`${c.fg}|${c.bg}`),
      );
      expect(failing.map((c) => `${mode} ${c.fg} on ${c.bg} ${c.ratio.toFixed(2)}`)).toEqual([]);
    }
  });
});

describe("accent contrast colour", () => {
  const withAccent = (ground: string, ink: string, accent: string) => {
    const custom = customFromPreset("sleeve");
    custom.light = { ...custom.light, ground, ink, accent };
    return derivePalette(custom).light["--gn-accent-contrast"];
  };

  it("prefers the ground, then the ink, then white, then black", () => {
    expect(withAccent("#ffffff", "#000000", "#202020")).toBe("#ffffff");
    expect(withAccent("#e0e0e0", "#101010", "#e8e8e8")).toBe("#101010");
    expect(withAccent("#303030", "#404040", "#101010")).toBe("#ffffff");
    expect(withAccent("#eeeeee", "#f0f0f0", "#e8e8e8")).toBe("#000000");
  });
});

describe("contrast warnings", () => {
  it("reports nothing for a passing palette", () => {
    expect(contrastFailures(customFromPreset("sleeve"))).toEqual({ light: [], dark: [] });
  });

  it("names the pairs the user's own colours break, per mode, and leaves them untouched", () => {
    const custom = customFromPreset("sleeve");
    custom.dark = { ...custom.dark, ink: "#1c1713" }; // ink almost the ground
    const failures = contrastFailures(custom);
    expect(failures.light).toEqual([]);
    const names = failures.dark.map((c) => `${c.fg} on ${c.bg}`);
    expect(names).toContain("--gn-ink on --gn-ground");
    expect(names).toContain("--gn-ink on --gn-surface");
    expect(failures.dark.every((c) => !c.pass && c.ratio < c.min)).toBe(true);
    expect(derivePalette(custom).dark["--gn-ink"]).toBe("#1c1713");
  });

  it("warns when the accent is too close to the ground to stand out", () => {
    const custom = customFromPreset("sleeve");
    custom.light = { ...custom.light, accent: "#f0e8da" };
    const names = contrastFailures(custom).light.map((c) => `${c.fg} on ${c.bg}`);
    expect(names).toContain("--gn-accent-solid on --gn-ground");
  });

  it("warns when preset status text no longer reads on a new ground", () => {
    const custom = customFromPreset("sleeve");
    custom.light = { ...custom.light, ground: "#4a2a2a", surface: "#4a2a2a" };
    const names = contrastFailures(custom).light.map((c) => `${c.fg} on ${c.bg}`);
    expect(names).toContain("--gn-status-missing-fg on --gn-ground");
  });
});

describe("validation", () => {
  const valid = customFromPreset("riso");

  it("accepts a valid palette and lowercases the hex", () => {
    const upper = structuredClone(valid);
    upper.light.ground = "#ABCDEF";
    expect(parseCustomPalette(upper)?.light.ground).toBe("#abcdef");
  });

  it.each([
    "red;}body{display:none",
    "url(https://evil.example/x)",
    "#fff",
    "rgba(0,0,0,0.5)",
    "#12345g",
    "#1234567",
    "red",
    "#abcdef;}",
    " #abcdef",
    "#abcdef\n",
    "",
  ])("rejects %j as a colour", (bad) => {
    expect(isHexColour(bad)).toBe(false);
    const custom = structuredClone(valid) as Record<string, any>;
    custom.dark.accent = bad;
    expect(parseCustomPalette(custom)).toBeNull();
  });

  it.each([
    ["an unknown base", { ...valid, base: "nope" }],
    ["the reserved id as a base", { ...valid, base: "custom" }],
    ["a missing mode", { base: "riso", light: valid.light }],
    ["a missing colour", { ...valid, light: { ground: "#ffffff" } }],
    ["an extra key", { ...valid, extra: 1 }],
    ["an extra colour", { ...valid, light: { ...valid.light, border: "#000000" } }],
    ["null", null],
    ["a string", "{}"],
  ])("rejects %s", (_name, value) => {
    expect(parseCustomPalette(value)).toBeNull();
  });

  it("only accepts the custom id when a custom palette exists", () => {
    expect(resolveAppearancePalette(customPaletteId, valid)).toBe("custom");
    expect(resolveAppearancePalette(customPaletteId, null)).toBe("sleeve");
    expect(resolveAppearancePalette("riso", null)).toBe("riso");
    expect(resolveAppearancePalette("nope", valid)).toBe("sleeve");
  });
});

describe("customPaletteCss", () => {
  it("refuses to emit anything that is not a hex colour", () => {
    const bad = customFromPreset("sleeve");
    bad.light.ground = "red;}body{display:none";
    expect(() => customPaletteCss(bad)).toThrow(/Refusing to emit/);
  });

  it("emits a light and a dark block of validated hex only", () => {
    const css = customPaletteCss(customFromPreset("midnight"));
    expect(css.startsWith(':root[data-palette="custom"]{')).toBe(true);
    expect(css).toContain(':root[data-palette="custom"].dark{');
    const declarations = css.match(/--gn-[a-z-]+:[^;]*;/g) ?? [];
    expect(declarations).toHaveLength(paletteVariableNames.length * 2);
    for (const d of declarations) expect(d).toMatch(/^--gn-[a-z-]+:#[0-9a-f]{6};$/);
    // Nothing but those declarations and the two selectors.
    expect(css.replace(/--gn-[a-z-]+:#[0-9a-f]{6};/g, "")).toBe(
      ':root[data-palette="custom"]{}:root[data-palette="custom"].dark{}',
    );
  });
});
