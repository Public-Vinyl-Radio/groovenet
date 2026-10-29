// The user's own palette. Five colours per mode are stored; everything else is
// derived here, so a better derivation later reaches palettes already saved.
// These values end up inside a <style> block, so nothing but a validated
// #rrggbb ever passes through this module.
import { z } from "zod";
import { contrastRatio } from "./contrast";
import { defaultPaletteId, isPaletteId, paletteIds, palettes, type PaletteId } from "./index";
import {
  paletteVariableNames,
  statusNames,
  type Palette,
  type PaletteValues,
  type PaletteVariable,
} from "./types";

/** The reserved palette id of the saved custom palette; never in the registry. */
export const customPaletteId = "custom";

/** Every id the appearance setting can hold. `custom` only with a stored custom palette. */
export type AppearancePaletteId = PaletteId | typeof customPaletteId;

export const customColourKeys = ["ground", "surface", "ink", "accent", "shadow"] as const;
export type CustomColourKey = (typeof customColourKeys)[number];
export type CustomColours = Record<CustomColourKey, string>;
export type CustomMode = "light" | "dark";
export const customModes: readonly CustomMode[] = ["light", "dark"];

/** What is saved: the preset it started from, and five colours per mode. */
export interface CustomPalette {
  base: PaletteId;
  light: CustomColours;
  dark: CustomColours;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHexColour = (value: unknown): value is string =>
  typeof value === "string" && HEX.test(value);

export const hexColourSchema = z
  .string()
  .regex(HEX, "must be a #rrggbb colour")
  .transform((value) => value.toLowerCase());

const coloursSchema = z
  .object({
    ground: hexColourSchema,
    surface: hexColourSchema,
    ink: hexColourSchema,
    accent: hexColourSchema,
    shadow: hexColourSchema,
  })
  .strict();

export const customPaletteSchema = z
  .object({
    base: z.enum(paletteIds),
    light: coloursSchema,
    dark: coloursSchema,
  })
  .strict();

/** A stored or submitted value as a custom palette, or null when it isn't a valid one. */
export function parseCustomPalette(value: unknown): CustomPalette | null {
  const parsed = customPaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A stored or requested id, accepting `custom` only when a custom palette exists. */
export function resolveAppearancePalette(
  value: unknown,
  custom: CustomPalette | null,
): AppearancePaletteId {
  if (value === customPaletteId) return custom ? customPaletteId : defaultPaletteId;
  return isPaletteId(value) ? value : defaultPaletteId;
}

/** The five inputs of a preset, to start a custom palette from it. */
export function customFromPreset(base: PaletteId): CustomPalette {
  const pick = (values: PaletteValues): CustomColours => ({
    ground: values["--gn-ground"].toLowerCase(),
    surface: values["--gn-surface"].toLowerCase(),
    ink: values["--gn-ink"].toLowerCase(),
    accent: values["--gn-accent-solid"].toLowerCase(),
    shadow: values["--gn-shadow"].toLowerCase(),
  });
  return { base, light: pick(palettes[base].light), dark: pick(palettes[base].dark) };
}

// --- colour maths (sRGB) ---------------------------------------------------

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: number[]) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** `from` moved `t` (0..1) of the way to `to`. */
export function mixHex(from: string, to: string, t: number) {
  const a = channels(from);
  const b = channels(to);
  return toHex(a.map((c, i) => c + (b[i] - c) * t));
}

const STEPS = 50;

/**
 * The first colour on the way from `start` to `target` that `ok` accepts, or
 * `target` when none does (the strongest the derivation can offer).
 */
function pull(start: string, target: string, ok: (colour: string) => boolean) {
  for (let step = 0; step <= STEPS; step++) {
    const colour = mixHex(start, target, step / STEPS);
    if (ok(colour)) return colour;
  }
  return target;
}

// --- derivation ------------------------------------------------------------

const TEXT = 4.5;
const NON_TEXT = 3;

function deriveMode(base: PaletteId, mode: CustomMode, c: CustomColours): PaletteValues {
  const preset = palettes[base][mode];
  const on = (fg: string, min: number, ...bgs: string[]) =>
    bgs.every((bg) => contrastRatio(fg, bg) >= min);

  const inkMuted = pull(mixHex(c.ink, c.ground, 0.3), c.ink, (x) =>
    on(x, TEXT, c.ground, c.surface),
  );
  const border = pull(mixHex(c.ink, c.ground, 0.5), c.ink, (x) =>
    on(x, NON_TEXT, c.ground, c.surface),
  );

  // A tint that keeps ink readable on it, then accent text that reads on the tint too.
  const subtle = pull(mixHex(c.ground, c.accent, 0.16), c.ground, (x) => on(c.ink, TEXT, x));
  const fg = pull(c.accent, c.ink, (x) => on(x, TEXT, c.ground, c.surface, subtle));
  const ring = pull(c.accent, c.ink, (x) => on(x, NON_TEXT, c.ground, c.surface));
  const accentBorder = pull(c.accent, c.ink, (x) => on(x, NON_TEXT, c.ground));

  // Text on the accent fill: ground or ink if either reads, else the best of black and white.
  const contrast = [c.ground, c.ink, "#ffffff"].find((x) => on(x, TEXT, c.accent)) ?? "#000000";

  const values: Record<string, string> = {
    "--gn-ground": c.ground,
    "--gn-surface": c.surface,
    "--gn-ink": c.ink,
    "--gn-ink-muted": inkMuted,
    "--gn-border": border,
    "--gn-accent-solid": c.accent,
    "--gn-accent-fg": fg,
    "--gn-accent-subtle": subtle,
    "--gn-accent-contrast": contrast,
    "--gn-accent-muted": mixHex(c.ground, c.accent, 0.35),
    "--gn-accent-emphasized": mixHex(c.ground, c.accent, 0.55),
    "--gn-accent-focus-ring": ring,
    "--gn-accent-border": accentBorder,
    "--gn-shadow": c.shadow,
  };
  // Status colours stay the preset's; nothing here edits them.
  for (const name of paletteVariableNames) {
    if (name.startsWith("--gn-status-")) values[name] = preset[name];
  }
  return Object.fromEntries(
    paletteVariableNames.map((name) => [name, values[name]]),
  ) as PaletteValues;
}

/** The full palette a custom palette renders as. Pure and deterministic. */
export function derivePalette(custom: CustomPalette): Palette {
  return {
    light: deriveMode(custom.base, "light", custom.light),
    dark: deriveMode(custom.base, "dark", custom.dark),
  };
}

// --- contrast report -------------------------------------------------------

export interface ContrastCheck {
  fg: PaletteVariable;
  bg: PaletteVariable;
  /** WCAG minimum for the pair. */
  min: number;
  ratio: number;
  pass: boolean;
}

type Pair = [PaletteVariable, PaletteVariable, number];

// The same pairs as palettes.test.ts, held to AA.
const PAIRS: Pair[] = [
  ["--gn-ink", "--gn-ground", TEXT],
  ["--gn-ink", "--gn-surface", TEXT],
  ["--gn-ink-muted", "--gn-ground", TEXT],
  ["--gn-ink-muted", "--gn-surface", TEXT],
  ["--gn-border", "--gn-ground", NON_TEXT],
  ["--gn-border", "--gn-surface", NON_TEXT],
  ["--gn-accent-contrast", "--gn-accent-solid", TEXT],
  ["--gn-accent-fg", "--gn-ground", TEXT],
  ["--gn-accent-fg", "--gn-surface", TEXT],
  ["--gn-accent-fg", "--gn-accent-subtle", TEXT],
  ["--gn-ink", "--gn-accent-subtle", TEXT],
  ["--gn-accent-focus-ring", "--gn-ground", NON_TEXT],
  ["--gn-accent-focus-ring", "--gn-surface", NON_TEXT],
  ["--gn-accent-border", "--gn-ground", NON_TEXT],
  ["--gn-accent-solid", "--gn-ground", NON_TEXT],
  ...statusNames.flatMap((s): Pair[] => [
    [`--gn-status-${s}-fg`, `--gn-status-${s}-subtle`, TEXT],
    [`--gn-status-${s}-fg`, "--gn-ground", TEXT],
    [`--gn-status-${s}-border`, "--gn-ground", NON_TEXT],
  ]),
];

/** Every pair of one mode's values, with its ratio and whether it passes. */
export function checkContrast(values: PaletteValues): ContrastCheck[] {
  return PAIRS.map(([fg, bg, min]) => {
    const ratio = contrastRatio(values[fg], values[bg]);
    return { fg, bg, min, ratio, pass: ratio >= min };
  });
}

/** The failing pairs per mode; empty arrays mean the palette passes AA. */
export function contrastFailures(custom: CustomPalette): Record<CustomMode, ContrastCheck[]> {
  const derived = derivePalette(custom);
  return {
    light: checkContrast(derived.light).filter((check) => !check.pass),
    dark: checkContrast(derived.dark).filter((check) => !check.pass),
  };
}

// --- CSS -------------------------------------------------------------------

function declarations(values: PaletteValues) {
  return paletteVariableNames
    .map((name) => {
      const value = values[name];
      // Unreachable for validated input; the guard keeps free text out of a <style>.
      if (!isHexColour(value)) throw new Error(`Refusing to emit ${name}`);
      return `${name}:${value};`;
    })
    .join("");
}

/**
 * The blocks that make `data-palette="custom"` a palette, built only from
 * validated hex. `:root[...]` outranks the default palette's `:root` block, so
 * it wins however the stylesheets are ordered.
 */
export function customPaletteCss(custom: CustomPalette): string {
  const { light, dark } = derivePalette(custom);
  return (
    `:root[data-palette="${customPaletteId}"]{${declarations(light)}}` +
    `:root[data-palette="${customPaletteId}"].dark{${declarations(dark)}}`
  );
}

/** The id of the <style> element that holds the custom palette's blocks. */
export const customPaletteStyleId = "gn-custom-palette";
