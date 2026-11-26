// A device's own appearance: palette, corners, custom palette and fonts kept in
// localStorage over the saved (server) setting, which stays the default. Plain
// data and functions with no React, so the pre-paint script, the hook and the
// tests share one definition.
//
// Resolution per field: this device's override, then the saved value, then the
// built-in default. Everything read from storage goes through the registries and
// `parseCustomPalette`, the same checks the API applies, and an invalid field is
// dropped alone so one bad value doesn't take the others with it.
import { cornerIds, resolveCorners, type CornerId } from "./corners";
import {
  fontRoleIds,
  isFontChoiceId,
  resolveFontChoice,
  type FontRoleId,
  type FontRoleChoice,
} from "./fontChoices";
import {
  customPaletteCss,
  customPaletteId,
  parseCustomPalette,
  resolveAppearancePalette,
  type AppearancePaletteId,
  type CustomPalette,
} from "./palettes/custom";
import { isPaletteId } from "./palettes";
import { parseLocalFontFamily } from "./localFont";

/** The one versioned localStorage key. */
export const appearanceOverrideKey = "gn-appearance";
export const appearanceOverrideVersion = 1;

/** Each role's own choice ids, as the API types them: a slab can't be the body font. */
export type RoleFonts = { [R in FontRoleId]: FontRoleChoice<R> };

/** Any of the fields; a missing one means "use the saved value". */
export interface AppearanceOverride {
  palette?: AppearancePaletteId;
  corners?: CornerId;
  /** This device's own custom palette (not the saved one). */
  customPalette?: CustomPalette;
  fonts?: Partial<RoleFonts>;
  /**
   * A family installed on this device, per role. It beats `fonts` for that role
   * and is never shared: the saved default can't name a font only this device has.
   */
  localFonts?: Partial<Record<FontRoleId, string>>;
}

/** The appearance a page renders: every field present. */
export interface ResolvedAppearance {
  palette: AppearancePaletteId;
  corners: CornerId;
  customPalette: CustomPalette | null;
  /** The choice the role falls back to; a local font, when set, draws over it. */
  fonts: RoleFonts;
  localFonts: Partial<Record<FontRoleId, string>>;
}

/** What `parseAppearanceOverride` and the store accept as a change: `null` clears a field. */
export interface AppearanceOverridePatch {
  palette?: AppearancePaletteId | null;
  corners?: CornerId | null;
  customPalette?: CustomPalette | null;
  fonts?: { [R in FontRoleId]?: FontRoleChoice<R> | null };
  localFonts?: { [R in FontRoleId]?: string | null };
}

export const emptyOverride: AppearanceOverride = Object.freeze({});

/**
 * Stored text as an override; anything unreadable is the empty override. Only
 * validated fields come out, whatever the text held.
 */
export function parseAppearanceOverride(raw: unknown): AppearanceOverride {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return emptyOverride;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyOverride;
  const stored = value as Record<string, unknown>;
  if (stored.v !== appearanceOverrideVersion) return emptyOverride;

  const override: AppearanceOverride = {};
  const customPalette = parseCustomPalette(stored.customPalette);
  if (customPalette) override.customPalette = customPalette;
  // `custom` names a palette only while one exists to render, here or saved, so it
  // is checked against the saved palette at resolution; the id alone is valid.
  if (stored.palette === customPaletteId || isPaletteId(stored.palette)) {
    override.palette = stored.palette as AppearancePaletteId;
  }
  if (cornerIds.some((id) => id === stored.corners)) override.corners = stored.corners as CornerId;

  const storedFonts = stored.fonts;
  if (storedFonts && typeof storedFonts === "object" && !Array.isArray(storedFonts)) {
    for (const role of fontRoleIds) {
      const id = (storedFonts as Record<string, unknown>)[role];
      if (isFontChoiceId(role, id)) override.fonts = { ...override.fonts, [role]: id };
    }
  }
  const storedLocal = stored.localFonts;
  if (storedLocal && typeof storedLocal === "object" && !Array.isArray(storedLocal)) {
    for (const role of fontRoleIds) {
      const family = parseLocalFontFamily((storedLocal as Record<string, unknown>)[role]);
      if (!family) continue;
      override.localFonts = { ...override.localFonts, [role]: family };
      // One source per role: the local font wins, as it does when set.
      if (override.fonts?.[role]) {
        const rest = { ...override.fonts };
        delete rest[role];
        if (Object.keys(rest).length > 0) override.fonts = rest;
        else delete override.fonts;
      }
    }
  }
  return override;
}

/** True when the device overrides nothing. */
export const isEmptyOverride = (override: AppearanceOverride) =>
  override.palette === undefined &&
  override.corners === undefined &&
  override.customPalette === undefined &&
  Object.keys(override.fonts ?? {}).length === 0 &&
  Object.keys(override.localFonts ?? {}).length === 0;

/** The override after a change; `null` fields are cleared, and what isn't named stays. */
export function mergeOverride(
  override: AppearanceOverride,
  patch: AppearanceOverridePatch,
): AppearanceOverride {
  const localFonts: Partial<Record<FontRoleId, string>> = { ...override.localFonts };
  const next: AppearanceOverride = { ...override, fonts: { ...override.fonts } };
  if (patch.palette !== undefined) {
    if (patch.palette === null) delete next.palette;
    else next.palette = patch.palette;
  }
  if (patch.corners !== undefined) {
    if (patch.corners === null) delete next.corners;
    else next.corners = patch.corners;
  }
  if (patch.customPalette !== undefined) {
    if (patch.customPalette === null) delete next.customPalette;
    else next.customPalette = patch.customPalette;
  }
  for (const role of fontRoleIds) {
    const choice = patch.fonts?.[role];
    if (choice === undefined) continue;
    if (choice === null) delete next.fonts?.[role];
    else {
      next.fonts = { ...next.fonts, [role]: choice } as Partial<RoleFonts>;
      delete localFonts[role];
    }
  }
  for (const role of fontRoleIds) {
    const family = patch.localFonts?.[role];
    if (family === undefined) continue;
    const safe = family === null ? null : parseLocalFontFamily(family);
    if (safe === null) delete localFonts[role];
    else {
      localFonts[role] = safe;
      delete next.fonts?.[role];
    }
  }
  if (Object.keys(next.fonts ?? {}).length === 0) delete next.fonts;
  if (Object.keys(localFonts).length > 0) next.localFonts = localFonts;
  else delete next.localFonts;
  return next;
}

/**
 * The stored text. The derived `<style>` blocks of a custom palette travel with
 * it so the pre-paint script can paint without the palette maths; the script
 * only accepts them when they match `customCssPattern`, and a load rewrites
 * them from the validated palette, so a better derivation reaches this device.
 */
export function serializeOverride(override: AppearanceOverride): string {
  return JSON.stringify({
    v: appearanceOverrideVersion,
    ...override,
    ...(override.customPalette ? { customCss: customPaletteCss(override.customPalette) } : {}),
  });
}

/** Saved settings in, this device's appearance out. */
export function resolveAppearance(
  saved: {
    palette?: unknown;
    corners?: unknown;
    customPalette?: unknown;
    fonts?: Partial<Record<FontRoleId, unknown>>;
  },
  override: AppearanceOverride = emptyOverride,
): ResolvedAppearance {
  const savedCustom = parseCustomPalette(saved.customPalette);
  const customPalette = override.customPalette ?? savedCustom;
  const savedPalette = resolveAppearancePalette(saved.palette, savedCustom);
  // An override of `custom` with no palette to render falls back to the saved one.
  const overridePalette =
    override.palette === customPaletteId && !customPalette ? undefined : override.palette;
  const fonts = Object.fromEntries(
    fontRoleIds.map((role) => [
      role,
      override.fonts?.[role] ?? resolveFontChoice(role, saved.fonts?.[role]),
    ]),
  ) as RoleFonts;
  return {
    palette: resolveAppearancePalette(overridePalette ?? savedPalette, customPalette),
    corners: override.corners ?? resolveCorners(saved.corners),
    customPalette,
    fonts,
    localFonts: { ...override.localFonts },
  };
}

/** Which fields this device overrides, for the "Overridden on this device" hints. */
export type OverriddenField = "palette" | "corners" | `font:${FontRoleId}`;

export function overriddenFields(override: AppearanceOverride): OverriddenField[] {
  const fields: OverriddenField[] = [];
  if (override.palette !== undefined || override.customPalette !== undefined) {
    fields.push("palette");
  }
  if (override.corners !== undefined) fields.push("corners");
  for (const role of fontRoleIds) {
    if (override.fonts?.[role] !== undefined || override.localFonts?.[role] !== undefined) {
      fields.push(`font:${role}`);
    }
  }
  return fields;
}
