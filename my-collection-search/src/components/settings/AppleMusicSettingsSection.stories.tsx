import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppleMusicSettingsSection from "./AppleMusicSettingsSection";

// Seeds the cookie status; upload, remove and the test need the API, which
// Storybook doesn't have.
const withCookies = (info: Record<string, unknown>) => [
  (Story: React.ComponentType) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["gamdl-cookies"], info);
    return (
      <QueryClientProvider client={client}>
        <Story />
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
