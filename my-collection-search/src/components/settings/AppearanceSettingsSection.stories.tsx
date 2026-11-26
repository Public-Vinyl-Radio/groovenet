import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { appearanceOverrideKey } from "@/app/appearanceOverride";
import { reloadAppearanceOverride } from "@/lib/appearanceOverrideStore";
import AppearanceSettingsSection from "./AppearanceSettingsSection";

const savedFonts = { display: "default", body: "default", label: "default" };

/** A story's saved default and this device's own override, which the stories seed in storage. */
function seed(fonts: Record<string, string>, override?: object) {
  const decorator = (Story: React.ComponentType) => {
    if (override)
      localStorage.setItem(appearanceOverrideKey, JSON.stringify({ v: 1, ...override }));
    else localStorage.removeItem(appearanceOverrideKey);
    reloadAppearanceOverride();
    const client = new QueryClient();
    client.setQueryData(queryKeys.appearance(), {
      palette: "sleeve",
      fonts,
      customPalette: null,
      corners: "square",
    });
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
  return decorator;
}

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

// Maple Mono is offered for Body and Labels, not Display.
export const MapleMono: StoryObj<typeof AppearanceSettingsSection> = {
  decorators: [seed({ ...savedFonts, body: "maple-mono", label: "maple-mono" })],
};

// A font installed on this device: a per-device override, never the saved default. The
// family only renders if this machine has it, and falls back to the generic stack if not.
export const FontOnThisDevice: StoryObj<typeof AppearanceSettingsSection> = {
  decorators: [seed(savedFonts, { localFonts: { body: "Menlo", label: "Courier New" } })],
};

// The phone layout: one full-width select per role.
export const Phone: StoryObj<typeof AppearanceSettingsSection> = {
  decorators: [seed(savedFonts)],
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
