import { describe, expect, it } from "vitest";
import { fontBlocks, paletteBlocks, system } from "./chakraTheme";
import { faceVariable, fontChoiceValue, fontRoleIds, fontRoles } from "./fontChoices";
import { paletteVariableNames, palettes, statusNames } from "./palettes";

const resolved = (name: string) => system.tokens.getByName(`colors.${name}`)?.value;

describe("chakra theme", () => {
  it("keeps accent.solid working for existing users", () => {
    expect(system.token("colors.accent.solid", "missing")).toBe("var(--chakra-colors-accent-solid)");
    expect(resolved("accent.solid")).toBe("var(--gn-accent-solid)");
  });

  it.each([
    ["bg", "--gn-ground"],
    ["bg.subtle", "--gn-surface"],
    ["bg.panel", "--gn-surface"],
    ["fg", "--gn-ink"],
    ["fg.muted", "--gn-ink-muted"],
    ["fg.subtle", "--gn-ink-muted"],
    ["border", "--gn-border"],
    ["border.subtle", "--gn-border"],
    ["fg.error", "--gn-status-missing-fg"],
    ["fg.warning", "--gn-status-analysis-fg"],
  ])("points %s at %s", (token, variable) => {
    expect(resolved(token)).toBe(`var(${variable})`);
  });

  it("derives neutral bg steps from ink over ground", () => {
    for (const token of ["bg.muted", "bg.emphasized"]) {
      expect(resolved(token)).toMatch(/^color-mix\(.*--gn-ink.*--gn-ground/);
    }
  });

  it("defines accent as a full virtual palette", () => {
    for (const part of ["solid", "contrast", "fg", "subtle", "muted", "emphasized", "focusRing", "border"]) {
      expect(resolved(`accent.${part}`), part).toMatch(/^var\(--gn-accent-/);
    }
  });

  it.each(["danger", "neutral"])("defines %s as a full virtual palette", (name) => {
    for (const part of ["solid", "contrast", "fg", "subtle", "muted", "emphasized", "focusRing", "border"]) {
      expect(resolved(`${name}.${part}`), part).toBeTruthy();
    }
  });

  it("keeps overlay colours constant across palettes", () => {
    for (const token of ["overlay.fg", "overlay.fg.muted", "overlay.fg.subtle", "overlay.track", "overlay.scrim", "overlay.backdrop"]) {
      expect(resolved(token), token).not.toMatch(/var\(--gn-/);
    }
  });

  it("defines fg, subtle and border for every status", () => {
    for (const status of statusNames) {
      for (const part of ["fg", "subtle", "border"]) {
        expect(resolved(`status.${status}.${part}`)).toBe(`var(--gn-status-${status}-${part})`);
      }
    }
  });

  it("only references variables that the palette contract declares", () => {
    const known = new Set<string>(paletteVariableNames);
    const semantic = ["bg", "fg", "border", "accent", "status"];
    for (const token of system.tokens.allTokens) {
      if (!semantic.includes(token.name.split(".")[1] ?? "")) continue;
      for (const [, name] of String(token.value).matchAll(/var\((--gn-[a-z-]+)\)/g)) {
        expect(known.has(name), `${token.name} -> ${name}`).toBe(true);
      }
    }
  });

  it("emits light and dark blocks for every palette", () => {
    const css = system._config.globalCss as unknown as Record<string, Record<string, string>>;
    for (const [id, palette] of Object.entries(palettes)) {
      const light = Object.entries(css).find(([sel]) => sel.endsWith(`[data-palette="${id}"]`));
      const dark = Object.entries(css).find(([sel]) => sel.endsWith(`[data-palette="${id}"].dark`));
      expect(light?.[1]).toEqual(palette.light);
      expect(dark?.[1]).toEqual(palette.dark);
    }
  });

  it("falls back to the default palette on :root for an unknown data-palette", () => {
    const css = system._config.globalCss as Record<string, unknown>;
    expect(Object.keys(css)).toContain(`:root, [data-palette="sleeve"]`);
    expect(Object.keys(css)).toContain(`:root.dark, [data-palette="sleeve"].dark`);
  });

  it("scopes only the default palette to :root", () => {
    const blocks = paletteBlocks({ sleeve: palettes.sleeve, other: palettes.sleeve }, "sleeve");
    expect(Object.keys(blocks)).toEqual([
      `:root, [data-palette="sleeve"]`,
      `:root.dark, [data-palette="sleeve"].dark`,
      `[data-palette="other"]`,
      `[data-palette="other"].dark`,
    ]);
  });

  describe("house style (#667)", () => {
    const token = (path: string) => system.tokens.getByName(path)?.value;

    it("squares every radius but leaves full for round things", () => {
      for (const name of ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
        expect(token(`radii.${name}`), name).toBe("0");
      }
      expect(token("radii.full")).toBe("9999px");
      // The semantic steps recipes use point at the squared scale.
      for (const name of ["l1", "l2", "l3"]) expect(token(`radii.${name}`), name).toMatch(/0|radii/);
    });

    it("has a 2px outline width", () => {
      expect(token("borderWidths.outline")).toBe("2px");
    });

    it.each(["xs", "sm", "md", "lg", "xl", "2xl", "pressed"])("makes shadow %s a hard offset with no blur", (name) => {
      expect(token(`shadows.${name}`)).toMatch(/^\d+px \d+px 0 0 var\(--gn-shadow\)$/);
    });

    it("keeps a smaller compact step than the container step", () => {
      expect(token("shadows.sm")).toBe("3px 3px 0 0 var(--gn-shadow)");
      expect(token("shadows.md")).toBe("6px 6px 0 0 var(--gn-shadow)");
    });

    it("points the font tokens at the variables the font choice sets", () => {
      expect(token("fonts.heading")).toMatch(/^var\(--gn-font-heading\), /);
      expect(token("fonts.body")).toMatch(/^var\(--gn-font-body\), /);
      expect(token("fonts.label")).toMatch(/^var\(--gn-font-label\), /);
      expect(token("fonts.mono")).toContain("var(--face-plex-mono");
    });

    it("rings default-palette controls in the palette's focus colour", () => {
      expect(resolved("gray.focusRing")).toBe("var(--gn-accent-focus-ring)");
      expect(resolved("gray.border")).toBe("var(--gn-border)");
    });

    it("draws the outline colour from ink", () => {
      expect(resolved("border.ink")).toBe("var(--gn-ink)");
    });

    it("gives the solid button an ink outline, hard shadow and a press that respects reduced motion", () => {
      const solid = (system._config.theme?.recipes?.button as any).variants.variant.solid;
      expect(solid.borderColor).toBe("border.ink");
      expect(solid.boxShadow).toBe("sm");
      const press = solid._active["@media (prefers-reduced-motion: no-preference)"];
      expect(press.transform).toBe("translate(2px, 2px)");
      expect(press.boxShadow).toBe("pressed");
      // Outside the media query nothing moves.
      expect(solid._active.transform).toBeUndefined();
    });

    it("keeps outline and ghost buttons shadowless", () => {
      const variants = (system._config.theme?.recipes?.button as any).variants.variant;
      expect(variants.outline.boxShadow).toBe("none");
      expect(variants.ghost.boxShadow).toBe("none");
    });

    it("makes every badge an uppercase label-face tag", () => {
      const base = (system._config.theme?.recipes?.badge as any).base;
      expect(base).toMatchObject({ fontFamily: "label", textTransform: "uppercase" });
    });

    it.each(["card", "dialog", "drawer", "popover", "menu", "select"])("outlines %s with a hard shadow", (name) => {
      const recipe = (system._config.theme?.slotRecipes as any)[name];
      const container = recipe.base?.content ?? recipe.variants.variant.outline.root;
      expect(container).toMatchObject({ borderWidth: "outline", boxShadow: "md" });
    });

    it("gives inputs, textareas and selects a 2px outline with an offset focus ring", () => {
      const recipes = system._config.theme?.recipes as any;
      for (const name of ["input", "textarea"]) {
        expect(recipes[name].variants.variant.outline).toMatchObject({ borderWidth: "outline", focusVisibleRing: "outside" });
      }
      const slots = system._config.theme?.slotRecipes as any;
      expect(slots.nativeSelect.variants.variant.outline.field.borderWidth).toBe("outline");
      expect(slots.select.variants.variant.outline.trigger.borderWidth).toBe("outline");
    });

    it("fills a selected segment with ink inside an outlined strip", () => {
      const root = (system._config.theme?.slotRecipes as any).segmentGroup.base.root;
      expect(root).toMatchObject({ borderWidth: "outline", "--segment-indicator-bg": "colors.neutral.solid" });
    });

    it("declares a global focus ring offset from the border", () => {
      const css = system._config.globalCss as unknown as Record<string, Record<string, string>>;
      expect(css[":focus-visible"]).toMatchObject({ outlineOffset: "2px" });
      expect(css[":focus-visible"].outline).toContain("var(--gn-accent-focus-ring)");
    });
  });
});

describe("font blocks", () => {
  const blocks = fontBlocks();
  const selector = (role: string, id: string) =>
    Object.keys(blocks).find((key) => key.endsWith(`[data-font-${role}="${id}"]`));

  it("emits a rule for every choice of every role, setting that role's variable", () => {
    for (const role of fontRoleIds) {
      for (const { id } of fontRoles[role].choices) {
        const key = selector(role, id);
        expect(key, `${role}/${id}`).toBeDefined();
        expect(blocks[key as string]).toEqual({ [fontRoles[role].variable]: fontChoiceValue(role, id) });
      }
    }
  });

  it("puts each role's default on :root, so a missing or unknown attribute still gets a face", () => {
    for (const role of fontRoleIds) {
      const defaults = Object.keys(blocks).filter((key) => key.startsWith(":root"));
      expect(defaults.some((key) => key.includes(`[data-font-${role}="default"]`)), role).toBe(true);
      const others = fontRoles[role].choices.slice(1).map(({ id }) => selector(role, id));
      for (const key of others) expect(key).not.toContain(":root");
    }
  });

  it("lists the default first, so an equally specific later choice wins", () => {
    const keys = Object.keys(blocks);
    for (const role of fontRoleIds) {
      const [first, ...rest] = fontRoles[role].choices.map(({ id }) => keys.indexOf(selector(role, id) as string));
      for (const index of rest) expect(index).toBeGreaterThan(first);
    }
  });

  it("maps a self-hosted face to its own variable, with the role's stack when it is missing", () => {
    expect(fontChoiceValue("body", "inter")).toBe(`var(${faceVariable("inter")}, ${fontRoles.body.fallback})`);
  });

  it("maps System to a stack with no face", () => {
    expect(fontChoiceValue("body", "system")).toMatch(/^system-ui/);
    expect(fontChoiceValue("label", "system")).toMatch(/^ui-monospace/);
    expect(fontChoiceValue("display", "system")).not.toContain("--face-");
  });

  it("is part of the theme's global CSS", () => {
    const global = system._config.globalCss as Record<string, unknown>;
    for (const key of Object.keys(blocks)) expect(global[key], key).toBeDefined();
  });
});
