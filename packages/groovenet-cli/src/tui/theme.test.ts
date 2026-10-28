import { describe, expect, it } from "vitest";
import { makeTheme, themeFromEnv, type Role } from "./theme.js";

const ROLES: Role[] = ["ink", "strong", "muted", "dim", "shadow", "selection", "selectionStrong", "reverse", "live", "warn", "error"];
const ANSI_NAMES = new Set(["green", "yellow", "red", "gray"]);

describe("theme", () => {
  it("uses only ANSI attributes and named colours", () => {
    for (const color of [true, false]) {
      const theme = makeTheme({ color });
      for (const role of ROLES) {
        const style = theme[role];
        if (style.color) expect(ANSI_NAMES.has(style.color)).toBe(true);
        expect(JSON.stringify(style)).not.toMatch(/#[0-9a-f]{3,6}/i);
      }
    }
  });

  it("maps the design's roles", () => {
    const theme = makeTheme({ color: true });
    expect(theme.live).toEqual({ color: "green" });
    expect(theme.reverse).toEqual({ inverse: true, bold: true });
    expect(theme.selection).toEqual({ inverse: true });
    expect(theme.muted).toEqual({ dimColor: true });
    expect(theme.dim).toEqual({ color: "gray" });
  });

  it("drops colour and dim under NO_COLOR but keeps inverse and bold", () => {
    const theme = themeFromEnv({ NO_COLOR: "1" });
    for (const role of ROLES) {
      expect(theme[role].color).toBeUndefined();
      expect(theme[role].dimColor).toBeUndefined();
    }
    expect(theme.selection).toEqual({ inverse: true });
    expect(theme.reverse).toEqual({ inverse: true, bold: true });
    expect(theme.strong).toEqual({ bold: true });
  });

  it("treats an empty NO_COLOR as unset, as no-color.org specifies", () => {
    expect(themeFromEnv({ NO_COLOR: "" })).toBe(makeTheme({ color: true }));
    expect(themeFromEnv({})).toBe(makeTheme({ color: true }));
    expect(themeFromEnv()).toBe(makeTheme({ color: !process.env.NO_COLOR }));
  });
});
