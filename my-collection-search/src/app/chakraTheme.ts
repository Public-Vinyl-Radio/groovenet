import { defineConfig, createSystem, defaultConfig, type SystemStyleObject } from "@chakra-ui/react";
import { fontChoiceValue, fontRoleIds, fontRoles } from "./fontChoices";
import * as house from "./houseStyle";
import {
  defaultPaletteId,
  paletteVariableNames,
  palettes,
  statusNames,
  type Palette,
  type PaletteVariable,
} from "./palettes";

const v = (name: PaletteVariable) => ({ value: `var(${name})` });

// Neutral steps (row hover, pressed) derived from ink over ground, so a palette
// needs no extra variables for them.
const mix = (percent: number) => ({
  value: `color-mix(in srgb, var(--gn-ink) ${percent}%, var(--gn-ground))`,
});

const statusTokens = Object.fromEntries(
  statusNames.map((status) => [
    status,
    {
      fg: v(`--gn-status-${status}-fg`),
      subtle: v(`--gn-status-${status}-subtle`),
      border: v(`--gn-status-${status}-border`),
    },
  ]),
);

function declarations(values: Palette["light"]) {
  return Object.fromEntries(
    paletteVariableNames.map((name) => [name, values[name]]),
  ) as Record<PaletteVariable, string>;
}

// Light blocks come first so an equally specific later palette wins. The
// default palette also answers on :root, so an unknown or missing
// data-palette still gets a complete set of variables.
export function paletteBlocks(
  all: Record<string, Palette>,
  defaultId: string,
): Record<string, SystemStyleObject> {
  return Object.fromEntries(
    Object.entries(all).flatMap(([id, palette]) => {
      const root = id === defaultId;
      return [
        [`${root ? ":root, " : ""}[data-palette="${id}"]`, declarations(palette.light)],
        [`${root ? ":root.dark, " : ""}[data-palette="${id}"].dark`, declarations(palette.dark)],
      ];
    }),
  );
}

// One block per choice, setting the role's variable. The default choice also
// answers on :root, so an unknown or missing data-font-<role> still gets a face,
// and it comes first so an equally specific later choice wins. Faces define
// only their own --face-* variable, so nothing else sets these.
export function fontBlocks(): Record<string, SystemStyleObject> {
  return Object.fromEntries(
    fontRoleIds.flatMap((role) =>
      fontRoles[role].choices.map(({ id }, index) => [
        `${index === 0 ? ":root, " : ""}[data-font-${role}="${id}"]`,
        { [fontRoles[role].variable]: fontChoiceValue(role, id) } as Record<`--${string}`, string>,
      ]),
    ),
  );
}

const config = defineConfig({
  globalCss: { ...paletteBlocks(palettes, defaultPaletteId), ...fontBlocks(), ...house.globalCss },
  theme: {
    tokens: {
      radii: house.radii,
      borderWidths: house.borderWidths,
      fonts: house.fonts,
    },
    recipes: house.recipes,
    slotRecipes: house.slotRecipes,
    semanticTokens: {
      colors: {
        bg: {
          DEFAULT: v("--gn-ground"),
          subtle: v("--gn-surface"),
          muted: mix(6),
          emphasized: mix(12),
          panel: v("--gn-surface"),
          error: v("--gn-status-missing-subtle"),
          warning: v("--gn-status-analysis-subtle"),
          success: v("--gn-status-success-subtle"),
        },
        fg: {
          DEFAULT: v("--gn-ink"),
          muted: v("--gn-ink-muted"),
          subtle: v("--gn-ink-muted"),
          error: v("--gn-status-missing-fg"),
          warning: v("--gn-status-analysis-fg"),
          success: v("--gn-status-success-fg"),
        },
        border: {
          DEFAULT: v("--gn-border"),
          subtle: v("--gn-border"),
          // The outline of controls and containers in the house style.
          ink: v("--gn-ink"),
          error: v("--gn-status-missing-border"),
          warning: v("--gn-status-analysis-border"),
          success: v("--gn-status-success-border"),
        },
        // The app's one accent: active filters, primary actions, playback
        // progress. A full virtual palette, so colorPalette="accent" works.
        accent: {
          solid: v("--gn-accent-solid"),
          contrast: v("--gn-accent-contrast"),
          fg: v("--gn-accent-fg"),
          subtle: v("--gn-accent-subtle"),
          muted: v("--gn-accent-muted"),
          emphasized: v("--gn-accent-emphasized"),
          focusRing: v("--gn-accent-focus-ring"),
          border: v("--gn-accent-border"),
        },
        // The page's default colorPalette is gray, so any control that doesn't
        // pick one rings in this colour. Chakra's own is too pale (about 2:1
        // on the ground); the focus ring must reach 3:1 in every palette.
        // Its border is likewise too pale for an outline button (under 2:1).
        gray: { focusRing: v("--gn-accent-focus-ring"), border: v("--gn-border") },
        status: statusTokens,
        // Destructive actions: the "missing" status colours, with a solid fill.
        danger: {
          solid: v("--gn-status-missing-fg"),
          contrast: v("--gn-ground"),
          fg: v("--gn-status-missing-fg"),
          subtle: v("--gn-status-missing-subtle"),
          muted: v("--gn-status-missing-subtle"),
          emphasized: v("--gn-status-missing-border"),
          focusRing: v("--gn-status-missing-border"),
          border: v("--gn-status-missing-border"),
        },
        // Neutral controls (inactive chips, plain badges): ink over ground.
        neutral: {
          solid: v("--gn-ink"),
          contrast: v("--gn-ground"),
          fg: v("--gn-ink-muted"),
          subtle: mix(6),
          muted: mix(12),
          emphasized: mix(18),
          focusRing: v("--gn-accent-focus-ring"),
          border: v("--gn-border"),
        },
        // Content drawn over album artwork or a dark scrim. Constant across
        // palettes and modes: it must stay legible on the image, not the page.
        overlay: {
          fg: { DEFAULT: { value: "#ffffff" }, muted: { value: "rgba(255, 255, 255, 0.7)" }, subtle: { value: "rgba(255, 255, 255, 0.5)" } },
          track: { value: "rgba(255, 255, 255, 0.3)" },
          scrim: { value: "rgba(0, 0, 0, 0.55)" },
          backdrop: { value: "rgba(0, 0, 0, 0.6)" },
        },
      },
      shadows: house.shadows,
    },
  },
});

export const system = createSystem(defaultConfig, config);
