"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fontRoleIds, resolveFontChoice } from "@/app/fontChoices";
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

/** A change to the palette and/or some fonts; what isn't named stays as it is. */
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

/** Point the page at a palette and/or fonts now; the server-rendered attributes only matter on load. */
export function applyAppearance(patch: AppearancePatch) {
  const { dataset } = document.documentElement;
  if (patch.palette) dataset.palette = patch.palette;
  for (const role of fontRoleIds) {
    const choice = patch.fonts?.[role];
    if (choice) dataset[fontDataKey[role]] = choice;
  }
}

/** The same keys as `patch`, read back from the page, for rolling it back. */
function snapshot(patch: AppearancePatch, custom: CustomPalette | null): AppearancePatch {
  const { dataset } = document.documentElement;
  const previous: AppearancePatch = {};
  if (patch.palette) previous.palette = resolveAppearancePalette(dataset.palette, custom);
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
