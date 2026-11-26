const statuses = ["missing", "analysis", "genre", "success"] as const;
const statusParts = ["fg", "subtle", "border"] as const;
const accentParts = [
  "solid",
  "fg",
  "subtle",
  "contrast",
  "muted",
  "emphasized",
  "focus-ring",
  "border",
] as const;

export type StatusName = (typeof statuses)[number];
export type StatusPart = (typeof statusParts)[number];

export const statusNames: readonly StatusName[] = statuses;

/** Every variable a palette must define, in light and in dark. */
export const paletteVariableNames = [
  "--gn-ground",
  "--gn-surface",
  "--gn-ink",
  "--gn-outline",
  "--gn-ink-muted",
  "--gn-border",
  ...accentParts.map((part) => `--gn-accent-${part}` as const),
  "--gn-shadow",
  ...statuses.flatMap((status) =>
    statusParts.map((part) => `--gn-status-${status}-${part}` as const),
  ),
] as const;

export type PaletteVariable = (typeof paletteVariableNames)[number];
export type PaletteValues = Record<PaletteVariable, string>;

/** WCAG level a palette's text pairs are held to; non-text pairs stay at 3:1. */
export type ContrastLevel = "AA" | "AAA";

export interface Palette {
  /** Defaults to AA. */
  contrast?: ContrastLevel;
  light: PaletteValues;
  dark: PaletteValues;
}
