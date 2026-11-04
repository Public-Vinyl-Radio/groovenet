import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import AboutSection from "./AboutSection";

// The wordmark follows the palette's light or dark mode: switch it from the toolbar.
const withUpdate = (update: Record<string, unknown>) => [
  (Story: React.ComponentType) => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(queryKeys.version(), {
      version: "1.2.3",
      gitSha: "abc1234",
      builtAt: "2026-10-01T00:00:00.000Z",
      nodeEnv: "production",
    });
    client.setQueryData(queryKeys.updateCheck(), {
      current: "1.2.3",
      comparable: true,
      latest: "1.2.3",
      updateAvailable: false,
      releaseUrl: null,
      error: null,
      ...update,
    });
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  },
];

const meta: Meta<typeof AboutSection> = {
  title: "Settings/AboutSection",
  component: AboutSection,
};
export default meta;

export const UpToDate: StoryObj<typeof AboutSection> = { decorators: withUpdate({}) };
export const UpdateAvailable: StoryObj<typeof AboutSection> = {
  decorators: withUpdate({
    latest: "1.3.0",
    updateAvailable: true,
    releaseUrl: "https://github.com/Public-Vinyl-Radio/groovenet/releases/tag/v1.3.0",
  }),
};
