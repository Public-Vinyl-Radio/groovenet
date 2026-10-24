"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fontRoleIds, resolveFontChoice } from "@/app/fontChoices";
import { resolvePaletteId } from "@/app/palettes";
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
function snapshot(patch: AppearancePatch): AppearancePatch {
  const { dataset } = document.documentElement;
  const previous: AppearancePatch = {};
  if (patch.palette) previous.palette = resolvePaletteId(dataset.palette);
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
  patch: AppearancePatch
): AppearanceSettingsResponse => ({
  palette: patch.palette ?? settings.palette,
  fonts: { ...settings.fonts, ...patch.fonts },
});

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
      const previous = snapshot(patch);
      const cached = queryClient.getQueryData<AppearanceSettingsResponse>(key);
      if (cached) queryClient.setQueryData(key, merge(cached, patch));
      applyAppearance(patch);
      return { previous, cached };
    },
    // onMutate ran first, so the snapshot is always there.
    onError: (_err, _patch, context) => {
      const { previous, cached } = context as {
        previous: AppearancePatch;
        cached: AppearanceSettingsResponse | undefined;
      };
      applyAppearance(previous);
      queryClient.setQueryData(key, cached);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
  });
}
