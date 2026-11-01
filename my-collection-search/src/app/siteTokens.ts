// What the marketing site (site/, #914) needs from the app's look: every
// palette in light and dark, and the font roles with the self-hosted files
// behind each face. The site is a standalone Astro package that can't import
// app TypeScript, so `just site-tokens` writes this out as
// site/src/data/palettes.json and copies the woff2 files and licences into
// site/public/fonts; siteTokens.test.ts fails while either is stale.
import { readdirSync } from "node:fs";
import path from "node:path";

import { fontRoleIds, fontRoles, type FontChoice, type FontRoleId } from "./fontChoices";
import { defaultPaletteId, palettes, type PaletteValues } from "./palettes";

export const fontsDir = path.join(import.meta.dirname, "fonts");

/** Where the export lands, relative to the repo root. */
export const siteTokensPath = "site/src/data/palettes.json";
export const siteFontsDir = "site/public/fonts";

export interface SiteFace {
  /** The CSS family name the site declares, from the choice's label. */
  family: string;
  files: Array<{ weight: number; file: string }>;
  licence: string;
}

export interface SiteTokens {
  generatedFrom: string;
  defaultPalette: string;
  palettes: Array<{
    id: string;
    label: string;
    contrast: "AA" | "AAA";
    light: PaletteValues;
    dark: PaletteValues;
  }>;
  fonts: Record<
    FontRoleId,
    { label: string; fallback: string; choices: Array<{ id: string; label: string; face: string }> }
  >;
  faces: Record<string, SiteFace>;
}

/** "IBM Plex Sans" → "IBMPlexSans", the prefix its woff2 files are named with. */
const filePrefix = (family: string) => family.replace(/\s+/g, "");

/** A face's files and licence, found by the naming fonts.ts and fonts.test.ts rely on. */
export function faceFiles(family: string, listing: readonly string[]): SiteFace {
  const prefix = filePrefix(family);
  const files = listing
    .map((file) => file.match(new RegExp(`^${prefix}-(\\d{3})\\.woff2$`)))
    .flatMap((match) => (match ? [{ weight: Number(match[1]), file: match[0] }] : []))
    .sort((a, b) => a.weight - b.weight);
  const licence = listing.find(
    (file) => /^OFL-.+\.txt$/.test(file) && prefix.startsWith(file.slice(4, -4)),
  );
  if (files.length === 0) throw new Error(`No woff2 files for ${family} (${prefix}-<weight>)`);
  if (!licence) throw new Error(`No OFL licence for ${family}`);
  return { family, files, licence };
}

/** Palette display names, as Settings → Appearance names them. */
const paletteLabel = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

export function buildSiteTokens(listing: readonly string[] = readdirSync(fontsDir)): SiteTokens {
  const faces: Record<string, SiteFace> = {};
  const fonts = {} as SiteTokens["fonts"];
  for (const role of fontRoleIds) {
    const { label, fallback, choices } = fontRoles[role];
    // System stacks ship no file and look different on every visitor's machine,
    // so the site only demos the self-hosted faces.
    const faced = (choices as readonly FontChoice[]).flatMap((c) =>
      c.face ? [{ id: c.id, label: c.label, face: c.face }] : [],
    );
    for (const choice of faced) faces[choice.face] ??= faceFiles(choice.label, listing);
    fonts[role] = { label, fallback, choices: faced };
  }
  return {
    generatedFrom:
      "my-collection-search/src/app/palettes and fontChoices.ts by `just site-tokens`. Don't edit.",
    defaultPalette: defaultPaletteId,
    palettes: Object.entries(palettes).map(([id, palette]) => ({
      id,
      label: paletteLabel(id),
      contrast: palette.contrast ?? "AA",
      light: palette.light,
      dark: palette.dark,
    })),
    fonts,
    faces,
  };
}

/** The file contents, exactly as committed. */
export const serializeSiteTokens = (tokens: SiteTokens) => `${JSON.stringify(tokens, null, 2)}\n`;

/** Every file the site copies from the app's fonts directory. */
export const siteFontFiles = (tokens: SiteTokens) => [
  ...new Set(
    Object.values(tokens.faces).flatMap((face) => [...face.files.map((f) => f.file), face.licence]),
  ),
];
