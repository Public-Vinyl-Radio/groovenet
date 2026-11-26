import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsernameProvider } from "@/providers/UsernameProvider";
import { queryKeys } from "@/lib/queryKeys";
import AppleMusicSettingsSection from "./AppleMusicSettingsSection";

// Seeds the cookie status; upload, remove and the test need the API, which
// Storybook doesn't have.
const withCookies = (info: Record<string, unknown>) => [
  (Story: React.ComponentType) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const friend = { id: 1, username: "Story library" };
    client.setQueryData(["gamdl-cookies"], info);
    client.setQueryData(queryKeys.friends(), [friend]);
    client.setQueryData(queryKeys.defaultLibrary(), { friend_id: 1 });
    client.setQueryData(queryKeys.gamdlSettings(1), {
      settings: {
        id: 1,
        friend_id: 1,
        audio_quality: "best",
        sample_rate_cap: 48000,
        lossless_fallback: true,
        save_cover: false,
        cover_format: "jpg",
        save_lyrics: false,
        lyrics_format: "lrc",
        overwrite_existing: false,
        skip_music_videos: true,
        max_retries: 3,
        created_at: "",
        updated_at: "",
      },
    });
    return (
      <QueryClientProvider client={client}>
        <UsernameProvider initialFriend={friend}>
          <Story />
        </UsernameProvider>
      </QueryClientProvider>
    );
  },
];

const meta: Meta<typeof AppleMusicSettingsSection> = {
  title: "Settings/AppleMusicSettingsSection",
  component: AppleMusicSettingsSection,
};
export default meta;

export const NoCookieFile: StoryObj<typeof AppleMusicSettingsSection> = {
  decorators: withCookies({ exists: false }),
};
export const Uploaded: StoryObj<typeof AppleMusicSettingsSection> = {
  decorators: withCookies({
    exists: true,
    isValid: true,
    filename: "cookies.txt",
    lastModified: "2026-10-30T12:00:00.000Z",
  }),
};
