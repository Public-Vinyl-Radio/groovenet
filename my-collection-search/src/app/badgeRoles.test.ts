import { describe, expect, it } from "vitest";
import { system } from "./chakraTheme";
import { recipes, roleRecipes } from "./houseStyle";
import { paletteVariableNames, palettes, type PaletteVariable } from "./palettes";

// Every colour a badge role asks for must exist in every palette, in light and
// dark (#963). An undefined token compiles to a value the browser drops, so it
// fails silently: B9 asked for `status.*.solid`, which no palette defines, and
// rendered stock near-black for every state.

const COLOUR_PROPS = new Set([
  "bg",
  "background",
  "backgroundColor",
  "color",
  "borderColor",
  "outlineColor",
  "fill",
  "stroke",
]);
const KEYWORDS = new Set(["transparent", "currentColor", "inherit"]);
const modes = ["light", "dark"] as const;

/** Every colour value in a style object, with where it was found. */
function colourValues(style: unknown, path = ""): [string, string][] {
  if (!style || typeof style !== "object") return [];
  return Object.entries(style).flatMap(([key, value]): [string, string][] => {
    const at = path ? `${path}.${key}` : key;
    if (typeof value === "string" && COLOUR_PROPS.has(key)) return [[at, value]];
    return colourValues(value, at);
  });
}

/** The `--gn-*` variables a colour token reads, or null when there is no such token. */
function paletteVariablesOf(value: string): string[] | null {
  const token = system.tokens.getByName(`colors.${value}`);
  if (!token) return null;
  return String(token.value).match(/--gn-[a-z-]+/g) ?? [];
}

type RecipeShape = {
  base?: unknown;
  variants?: Record<string, Record<string, unknown>>;
  compoundVariants?: { css?: unknown }[];
};

/** The style objects of a recipe: its base, each variant value and each compound's css. */
function recipeStyles(recipe: RecipeShape): [string, unknown][] {
  return [
    ["base", recipe.base],
    ...Object.entries(recipe.variants ?? {}).flatMap(([variant, values]) =>
      Object.entries(values).map(([value, style]): [string, unknown] => [
        `${variant}=${value}`,
        style,
      ]),
    ),
    ...(recipe.compoundVariants ?? []).map((compound, i): [string, unknown] => [
      `compound ${i}`,
      compound.css,
    ]),
  ];
}

const roles = Object.entries(roleRecipes).map(
  ([name, recipe]) =>
    [
      name,
      recipeStyles(recipe as RecipeShape).flatMap(([at, style]) => colourValues(style, at)),
    ] as const,
);

describe("badge role tokens", () => {
  it("are registered in the theme's recipes", () => {
    for (const name of Object.keys(roleRecipes)) {
      expect(recipes, name).toHaveProperty(name);
    }
  });

  describe.each(roles)("%s", (_name, values) => {
    it("names at least one colour", () => {
      expect(values.length).toBeGreaterThan(0);
    });

    it.each(values)("%s: %s never defers to colorPalette", (_at, value) => {
      expect(value).not.toMatch(/^colorPalette\./);
    });

    it.each(values.filter(([, value]) => !KEYWORDS.has(value)))(
      "%s: %s is a token that every palette defines in light and dark",
      (at, value) => {
        const variables = paletteVariablesOf(value);
        expect(variables, `${at}: colors.${value} is not a token`).not.toBeNull();
        expect(
          variables!.length,
          `${at}: colors.${value} reads no palette variable`,
        ).toBeGreaterThan(0);
        for (const variable of variables!) {
          expect(paletteVariableNames, `${at}: ${variable}`).toContain(variable);
          for (const [id, palette] of Object.entries(palettes)) {
            for (const mode of modes) {
              expect(
                palette[mode][variable as PaletteVariable],
                `${id} ${mode} defines ${variable} (${at})`,
              ).toMatch(/^#[0-9a-f]{6}$/i);
            }
          }
        }
      },
    );
  });

  // The check above would have caught B9.
  it("flags the tokens B9 asked for, which no palette defines", () => {
    expect(paletteVariablesOf("status.missing.solid")).toBeNull();
    expect(paletteVariablesOf("status.success.contrast")).toBeNull();
    expect(paletteVariablesOf("status.missing.subtle")).toEqual(["--gn-status-missing-subtle"]);
  });

  it("finds colours inside variants, compounds and conditions, and skips variant names", () => {
    const styles = recipeStyles({
      base: { _hover: { bg: "a" } },
      variants: { stroke: { fill: { color: "b" } } },
      compoundVariants: [{ css: { borderColor: "c" } }],
    });
    expect(styles.flatMap(([at, style]) => colourValues(style, at))).toEqual([
      ["base._hover.bg", "a"],
      ["stroke=fill.color", "b"],
      ["compound 0.borderColor", "c"],
    ]);
    expect(recipeStyles({})).toEqual([["base", undefined]]);
    expect(colourValues(null)).toEqual([]);
  });
});
