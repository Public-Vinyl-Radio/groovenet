"use client";

import { useQuery } from "@tanstack/react-query";
import type { ThemeSetting } from "@/components/ui/color-mode";
import { useColorMode } from "@/components/ui/color-mode";
import { resolveAppearancePalette } from "@/app/palettes/custom";
import { useAppearanceSettingsQuery } from "@/hooks/useAppearanceSettings";
import { useCookieStatus } from "@/hooks/useCookieManagement";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useVersionInfo } from "@/hooks/useSystemInfo";
import { queryKeys } from "@/lib/queryKeys";
import { useUsername } from "@/providers/UsernameProvider";
import { fetchAiPromptSettings } from "@/services/internalApi/settings";
import type { SettingsSectionId } from "./settingsSections";

// The current value under each row of the phone drill-in list: "Mono · light
// on this device", "4 libraries · default collector-2". A value that hasn't
// loaded is undefined, and the row shows its label alone.

export type SettingsSummaries = Partial<Record<SettingsSectionId, string>>;

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function appearanceSummary(palette: string, mode: ThemeSetting): string {
  const where = mode === "system" ? "follows this device" : `${mode} on this device`;
  return `${capitalise(palette)} · ${where}`;
}

export function librariesSummary(count: number, defaultName: string | null | undefined): string {
  const libraries = `${count} ${count === 1 ? "library" : "libraries"}`;
  return defaultName ? `${libraries} · default ${defaultName}` : libraries;
}

export function appleMusicSummary(hasCookieFile: boolean): string {
  return hasCookieFile ? "Cookie file uploaded" : "No cookie file";
}

export function aiMetadataSummary(isDefault: boolean): string {
  return isDefault ? "Default prompt" : "Custom prompt";
}

export function aboutSummary(version: string): string {
  return `Version ${version}`;
}

export function useSettingsSummaries(): SettingsSummaries {
  const appearance = useAppearanceSettingsQuery();
  const { colorModeSetting } = useColorMode();
  const { friends, friendsLoading } = useFriendsQuery({ showCurrentUser: true });
  const { friend } = useUsername();
  const cookies = useCookieStatus();
  const aiPrompt = useQuery({
    queryKey: queryKeys.aiPromptSettings(friend?.id),
    queryFn: () => fetchAiPromptSettings({ friend_id: friend?.id }),
    enabled: !!friend,
  });
  const version = useVersionInfo();

  return {
    appearance: appearance.data
      ? appearanceSummary(
          resolveAppearancePalette(appearance.data.palette, appearance.data.customPalette ?? null),
          colorModeSetting,
        )
      : undefined,
    libraries: friendsLoading ? undefined : librariesSummary(friends.length, friend?.username),
    "apple-music": cookies.data ? appleMusicSummary(cookies.data.exists) : undefined,
    "ai-metadata": aiPrompt.data ? aiMetadataSummary(aiPrompt.data.isDefault) : undefined,
    about: version.data ? aboutSummary(version.data.version) : undefined,
  };
}
