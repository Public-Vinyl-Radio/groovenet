import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import AppearanceSettingsSection from "./AppearanceSettingsSection";

// Switch Corners, Display, Body and Labels from the toolbar; the section's own
// Corners control saves through the API, which Storybook doesn't have.
const meta: Meta<typeof AppearanceSettingsSection> = {
  title: "Settings/AppearanceSettingsSection",
  component: AppearanceSettingsSection,
  decorators: [
    (Story) => {
      const client = new QueryClient();
      client.setQueryData(queryKeys.appearance(), {
        palette: "sleeve",
        fonts: { display: "default", body: "default", label: "default" },
        customPalette: null,
        corners: "square",
      });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};
export default meta;

export const Default: StoryObj<typeof AppearanceSettingsSection> = {};
export const Rounded: StoryObj<typeof AppearanceSettingsSection> = {
  globals: { corners: "rounded" },
};
