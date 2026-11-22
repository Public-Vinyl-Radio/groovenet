"use client";

import { useQuery } from "@tanstack/react-query";
import type { ThemeSetting } from "@/components/ui/color-mode";
import { useColorMode } from "@/components/ui/color-mode";
import { resolveAppearance } from "@/app/appearanceOverride";
import { useAppearanceOverride, useAppearanceSettingsQuery } from "@/hooks/useAppearanceSettings";
import { useCookieStatus } from "@/hooks/useCookieManagement";
import { useFriendsQuery } from "@/hooks/useFriendsQuery";
import { useVersionInfo } from "@/hooks/useSystemInfo";
import { useRankingProfilesQuery } from "@/hooks/useRankingProfiles";
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

/** The profile Suggestions use, and a count when the other surfaces differ. */
export function rankingSummary(names: string[]): string {
  const [first, ...rest] = names;
  const others = new Set(rest.filter((name) => name !== first)).size;
  return others > 0 ? `${first} · ${others + 1} profiles in use` : first;
}

export function aboutSummary(version: string): string {
  return `Version ${version}`;
}

export function useSettingsSummaries(): SettingsSummaries {
  const appearance = useAppearanceSettingsQuery();
  const appearanceOverride = useAppearanceOverride();
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
  const ranking = useRankingProfilesQuery();
  const nameOf = (id: string) => ranking.data.profiles.find((p) => p.id === id)?.name ?? "Default";

  return {
    appearance: appearance.data
      ? appearanceSummary(
          resolveAppearance(appearance.data, appearanceOverride).palette,
          colorModeSetting,
        )
      : undefined,
    libraries: friendsLoading ? undefined : librariesSummary(friends.length, friend?.username),
    ranking: ranking.isSuccess
      ? rankingSummary(
          [
            ranking.data.active.suggestions,
            ranking.data.active.related,
            ranking.data.active.recommendations,
          ].map(nameOf),
        )
      : undefined,
    "apple-music": cookies.data ? appleMusicSummary(cookies.data.exists) : undefined,
    "ai-metadata": aiPrompt.data ? aiMetadataSummary(aiPrompt.data.isDefault) : undefined,
    about: version.data ? aboutSummary(version.data.version) : undefined,
  };
}
