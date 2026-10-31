import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import SpinTrackRow from "@/components/spins/SpinTrackRow";
import { spinPlays } from "@/components/spins/spinSummary";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { EVENING, loggedSpin } from "./fixtures/listeningLog";

const [vinyl] = spinPlays(EVENING[1]);
const [digital] = spinPlays(EVENING[0]);
const [longTitle] = spinPlays(
  loggedSpin({
    start: "2026-10-28T01:06:00.000Z",
    record: "Meridian Brothers & El Grupo Renacimiento",
    artist: "Meridian Brothers & Grupo Renacimiento",
    tracks: [["B4", "La Mujer Sin Corazón (Original De La Calandria)"]],
    medium: "digital",
    art: false,
  }),
);

const meta: Meta<typeof SpinTrackRow> = {
  title: "Spins/SpinTrackRow",
  component: SpinTrackRow,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
          <Box maxW="720px" borderWidth="outline" borderColor="border.ink">
            <Story />
          </Box>
        </DisplayTimeZoneProvider>
      </QueryClientProvider>
    ),
  ],
  args: { play: vinyl },
};

export default meta;
type Story = StoryObj<typeof SpinTrackRow>;

export const Vinyl: Story = {};

export const Digital: Story = { args: { play: digital } };

export const LongTitleNoArt: Story = {
  name: "Long title, no art",
  args: { play: longTitle },
};

export const Compact: Story = {
  name: "Compact (inside a record group)",
  args: { play: vinyl, compact: true },
};
