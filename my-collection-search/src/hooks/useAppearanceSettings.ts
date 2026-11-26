"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  overriddenFields,
  resolveAppearance,
  type AppearanceOverride,
  type AppearanceOverridePatch,
  type ResolvedAppearance,
} from "@/app/appearanceOverride";
import {
  getAppearanceOverride,
  getServerAppearanceOverride,
  refreshStoredAppearanceOverride,
  resetAppearanceOverride,
  subscribeAppearanceOverride,
  updateAppearanceOverride,
} from "@/lib/appearanceOverrideStore";
import { resolveCorners } from "@/app/corners";
import { fontRoleIds, fontRoles, resolveFontChoice, type FontRoleId } from "@/app/fontChoices";
import { localFontStack } from "@/app/localFont";
import {
  customPaletteCss,
  customPaletteStyleId,
  resolveAppearancePalette,
  type CustomPalette,
} from "@/app/palettes/custom";
import { queryKeys } from "@/lib/queryKeys";
import {
  fetchAppearanceSettings,
  updateAppearanceSettings,
  type AppearanceSettingsResponse,
  type UpdateAppearanceSettingsBody,
} from "@/services/internalApi/settings";

/** A change to the palette, corners and/or some fonts; what isn't named stays as it is. */
export type AppearancePatch = UpdateAppearanceSettingsBody;

/** The attribute on <html> that carries a font role's choice. */
const fontDataKey = {
  display: "fontDisplay",
  body: "fontBody",
  label: "fontLabel",
} as const;

/**
 * Puts the custom palette's blocks in the page, or removes them for null. The
 * server renders the same element when the saved palette is custom; this
 * covers choosing or editing one without a reload.
 */
export function applyCustomPaletteStyle(custom: CustomPalette | null) {
  let el = document.getElementById(customPaletteStyleId);
  if (!custom) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = customPaletteStyleId;
    document.head.appendChild(el);
  }
  el.textContent = customPaletteCss(custom);
}

/** Point the page at a palette, corners and/or fonts now; the server-rendered attributes only matter on load. */
export function applyAppearance(patch: AppearancePatch) {
  const { dataset } = document.documentElement;
  if (patch.palette) dataset.palette = patch.palette;
  if (patch.corners) dataset.corners = patch.corners;
  for (const role of fontRoleIds) {
    const choice = patch.fonts?.[role];
    if (choice) dataset[fontDataKey[role]] = choice;
  }
}

/**
 * Draws each role's installed font over its choice, or removes the inline
 * variable when the role has none. An inline custom property beats the
 * `[data-font-<role>]` rules, so the choice underneath stays the fallback.
 */
export function applyLocalFonts(localFonts: Partial<Record<FontRoleId, string>>) {
  const { style } = document.documentElement;
  for (const role of fontRoleIds) {
    const family = localFonts[role];
    if (family) style.setProperty(fontRoles[role].variable, localFontStack(role, family));
    else style.removeProperty(fontRoles[role].variable);
  }
}

/** The same keys as `patch`, read back from the page, for rolling it back. */
function snapshot(patch: AppearancePatch, custom: CustomPalette | null): AppearancePatch {
  const { dataset } = document.documentElement;
  const previous: AppearancePatch = {};
  if (patch.palette) previous.palette = resolveAppearancePalette(dataset.palette, custom);
  if (patch.corners) previous.corners = resolveCorners(dataset.corners);
  for (const role of fontRoleIds) {
    if (!patch.fonts?.[role]) continue;
    previous.fonts = {
      ...previous.fonts,
      [role]: resolveFontChoice(role, dataset[fontDataKey[role]]),
    };
  }
  return previous;
}

const merge = (
  settings: AppearanceSettingsResponse,
  patch: AppearancePatch,
): AppearanceSettingsResponse => ({
  palette: resolveAppearancePalette(
    patch.palette ?? settings.palette,
    customAfter(settings, patch),
  ),
  fonts: { ...settings.fonts, ...patch.fonts },
  corners: patch.corners ?? settings.corners,
  customPalette: customAfter(settings, patch),
});

/** The custom palette once `patch` is applied: replaced, deleted (null) or unchanged. */
function customAfter(
  settings: AppearanceSettingsResponse,
  patch: AppearancePatch,
): CustomPalette | null {
  return patch.customPalette === undefined ? (settings.customPalette ?? null) : patch.customPalette;
}

export function useAppearanceSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.appearance(),
    queryFn: fetchAppearanceSettings,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Saves a palette and/or font change. It applies to the page and to the cached
 * setting at once, and both go back if the save fails.
 */
export function useUpdateAppearanceSettings() {
  const queryClient = useQueryClient();
  const key = queryKeys.appearance();
  return useMutation({
    mutationFn: (patch: AppearancePatch) => updateAppearanceSettings(patch),
    onMutate: (patch) => {
      // A refetch already in flight would land the old value over this change.
      void queryClient.cancelQueries({ queryKey: key });
      const cached = queryClient.getQueryData<AppearanceSettingsResponse>(key);
      const previous = snapshot(patch, cached?.customPalette ?? null);
      const next = cached ? merge(cached, patch) : undefined;
      if (next) queryClient.setQueryData(key, next);
      applyCustomPaletteStyle(next ? next.customPalette : (patch.customPalette ?? null));
      // Deleting the palette in use falls back to the default, as the server does.
      applyAppearance(
        patch.customPalette === null && next ? { ...patch, palette: next.palette } : patch,
      );
      return { previous, cached };
    },
    // onMutate ran first, so the snapshot is always there.
    onError: (_err, patch, context) => {
      const { previous, cached } = context as {
        previous: AppearancePatch;
        cached: AppearanceSettingsResponse | undefined;
      };
      applyCustomPaletteStyle(cached?.customPalette ?? null);
      applyAppearance(previous);
      if (cached && patch.customPalette === null) applyAppearance({ palette: cached.palette });
      queryClient.setQueryData(key, cached);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
  });
}

// --- This device's override --------------------------------------------------

/** This device's override, live: it follows writes here and in other tabs. */
export function useAppearanceOverride(): AppearanceOverride {
  return useSyncExternalStore(
    subscribeAppearanceOverride,
    getAppearanceOverride,
    getServerAppearanceOverride,
  );
}

/** Put a whole resolved appearance in the page. */
export function applyResolvedAppearance(resolved: ResolvedAppearance) {
  applyCustomPaletteStyle(resolved.customPalette);
  applyAppearance(resolved);
  applyLocalFonts(resolved.localFonts);
}

/** What the override clears once its value is the saved default. */
function clearingPatch(patch: AppearancePatch): AppearanceOverridePatch {
  const clear: AppearanceOverridePatch = {};
  if (patch.palette) clear.palette = null;
  if (patch.corners) clear.corners = null;
  if (patch.customPalette) clear.customPalette = null;
  for (const role of fontRoleIds) {
    if (patch.fonts?.[role]) clear.fonts = { ...clear.fonts, [role]: null };
  }
  return clear;
}

/** The saved setting's fields that this device overrides, as a PUT body. */
export function overrideAsDefaultPatch(override: AppearanceOverride): AppearancePatch {
  const patch: AppearancePatch = {};
  if (override.palette) patch.palette = override.palette;
  if (override.corners) patch.corners = override.corners;
  if (override.customPalette) patch.customPalette = override.customPalette;
  if (override.fonts && Object.keys(override.fonts).length > 0) patch.fonts = { ...override.fonts };
  return patch;
}

/**
 * The saved setting, this device's override, and what resolves from them. Edits
 * go to the device; `setAsDefault` is the shared PUT, after which this device
 * follows the new default again.
 */
export function useDeviceAppearance() {
  const saved = useAppearanceSettingsQuery();
  const override = useAppearanceOverride();
  const update = useUpdateAppearanceSettings();
  const resolved = useMemo(
    () => resolveAppearance(saved.data ?? {}, override),
    [saved.data, override],
  );
  const overridden = useMemo(() => overriddenFields(override), [override]);
  // A font installed here can't be anyone else's default, so it doesn't count.
  const canSetAsDefault = useMemo(
    () => Object.keys(overrideAsDefaultPatch(override)).length > 0,
    [override],
  );

  const setAsDefault = (options?: Parameters<typeof update.mutate>[1]) => {
    const patch = overrideAsDefaultPatch(override);
    update.mutate(patch, {
      ...options,
      onSuccess: (...args) => {
        updateAppearanceOverride(clearingPatch(patch));
        options?.onSuccess?.(...args);
      },
    });
  };

  return {
    saved,
    override,
    resolved,
    overridden,
    canSetAsDefault,
    set: updateAppearanceOverride,
    reset: updateAppearanceOverride,
    resetAll: resetAppearanceOverride,
    setAsDefault,
    updateShared: update,
    savingDefault: update.isPending,
  };
}

/**
 * Keeps <html> on the resolved appearance. The pre-paint script already did this
 * before first paint; this covers edits, another tab's, and a saved default that
 * changed under a mounted page. It also refreshes the stored record once.
 */
export function useSyncAppearance() {
  const saved = useAppearanceSettingsQuery().data;
  const override = useAppearanceOverride();
  useEffect(() => {
    refreshStoredAppearanceOverride();
  }, []);
  useEffect(() => {
    if (saved) applyResolvedAppearance(resolveAppearance(saved, override));
  }, [saved, override]);
}
