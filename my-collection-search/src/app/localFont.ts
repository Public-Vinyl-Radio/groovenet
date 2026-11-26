// A font installed on this device, chosen by family name (#1294). It exists
// only on that device, so it is a per-device override and never part of the
// saved (shared) setting.
//
// The family name ends up in CSS and in the inline pre-paint script, so it is
// treated as hostile until it matches `localFontFamilyPattern`: letters,
// digits, spaces, `-` and `_`, starting with a letter or digit, at most 64
// characters. None of `" ' ; : { } ( ) < > \ /` can pass, so a name can never
// close a string, end a declaration or open a `url()`. It is always emitted
// double-quoted, followed by the role's generic stack, so a font that has
// since been uninstalled falls through to the fallback.
import { fontRoles, type FontRoleId } from "./fontChoices";

/** The longest family name accepted. */
export const localFontMaxLength = 64;

/**
 * The accepted shape, as a source string: the pre-paint script compiles the
 * same text, so the two checks cannot drift apart.
 */
export const localFontFamilyPattern = String.raw`^[\p{L}\p{N}][\p{L}\p{N} _-]{0,${localFontMaxLength - 1}}$`;

const familyRegExp = new RegExp(localFontFamilyPattern, "u");

/** A family name safe to put in a CSS string, or null. Surrounding spaces are trimmed. */
export function parseLocalFontFamily(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const family = value.trim().replace(/ {2,}/g, " ");
  return familyRegExp.test(family) ? family : null;
}

/** The `font-family` value for a role: the quoted family, then the role's generic stack. */
export function localFontStack(role: FontRoleId, family: string): string {
  const safe = parseLocalFontFamily(family);
  const fallback = fontRoles[role].fallback;
  return safe ? `"${safe}", ${fallback}` : fallback;
}

/** The families a `queryLocalFonts()` result offers, deduplicated, valid and sorted. */
export function localFontFamilies(fonts: ReadonlyArray<{ family: string }>): string[] {
  const families = new Set<string>();
  for (const { family } of fonts) {
    const safe = parseLocalFontFamily(family);
    if (safe) families.add(safe);
  }
  return [...families].sort((a, b) => a.localeCompare(b));
}

type QueryLocalFonts = () => Promise<Array<{ family: string }>>;

/** The Local Font Access API, where the browser has it (Chromium). */
export function localFontAccess(): QueryLocalFonts | null {
  if (typeof window === "undefined") return null;
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  return typeof query === "function" ? query.bind(window) : null;
}

const probeText = "mmmmmmmmmmlli0Oo wWgq";
const probeBases = ["monospace", "serif", "sans-serif"] as const;

/**
 * Whether a family is installed: its text measures differently from a bare
 * generic for at least one of three bases. `document.fonts.check` answers true
 * for a family that doesn't exist, so this measures on a canvas instead.
 * Returns null when there is no canvas to measure with, which is "can't tell",
 * not "missing".
 */
export function isLocalFontInstalled(family: string): boolean | null {
  const safe = parseLocalFontFamily(family);
  if (!safe || typeof document === "undefined") return false;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  const width = (stack: string) => {
    context.font = `72px ${stack}`;
    return context.measureText(probeText).width;
  };
  return probeBases.some((base) => width(`"${safe}", ${base}`) !== width(base));
}
