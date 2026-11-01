// The app's palettes and font roles, from the export `just site-tokens` writes
// (my-collection-search/src/app/siteTokens.ts). Never hand-edit palettes.json:
// a web test fails while it differs from the app.
import tokens from "../data/palettes.json";

export type Mode = "light" | "dark";
export type PaletteValues = (typeof tokens.palettes)[number]["light"];
export type Palette = (typeof tokens.palettes)[number];

/** The page itself is drawn in Mono; the demo leads with it too. */
export const sitePaletteId = "mono";

export const palettes: Palette[] = [
  ...tokens.palettes.filter((p) => p.id === sitePaletteId),
  ...tokens.palettes.filter((p) => p.id !== sitePaletteId),
];

export const sitePalette = palettes[0];
export const fonts = tokens.fonts;
export const faces = tokens.faces as Record<string, (typeof tokens.faces)["inter"]>;

/** The site's short names for the palette variables it uses. */
export function cssVars(v: PaletteValues, prefix = "--") {
  return [
    [`${prefix}ground`, v["--gn-ground"]],
    [`${prefix}surface`, v["--gn-surface"]],
    [`${prefix}ink`, v["--gn-ink"]],
    [`${prefix}muted`, v["--gn-ink-muted"]],
    [`${prefix}border`, v["--gn-border"]],
    [`${prefix}accent`, v["--gn-accent-solid"]],
    [`${prefix}contrast`, v["--gn-accent-contrast"]],
    [`${prefix}focus`, v["--gn-accent-focus-ring"]],
    [`${prefix}shadow`, v["--gn-shadow"]],
  ]
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

export const faceFamily = (face: string) => `"${faces[face].family}"`;

/** A role choice's font-family, with the role's fallback stack. */
export function choiceFamily(role: keyof typeof fonts, face: string) {
  return `${faceFamily(face)}, ${fonts[role].fallback}`;
}

/** @font-face rules for every self-hosted face, copied from the app. */
export const fontFaceCss = Object.values(faces)
  .flatMap((face) =>
    face.files.map(
      (f) =>
        `@font-face{font-family:"${face.family}";src:url("/fonts/${f.file}") format("woff2");font-weight:${f.weight};font-style:normal;font-display:swap}`,
    ),
  )
  .join("\n");
