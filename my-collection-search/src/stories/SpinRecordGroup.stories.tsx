import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import SpinRecordGroup from "@/components/spins/SpinRecordGroup";
import { groupPlaysByRecord, spinPlays } from "@/components/spins/spinSummary";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { EVENING } from "./fixtures/listeningLog";

const [innerspeaker] = groupPlaysByRecord(spinPlays(EVENING[1]));
const [cumbia] = groupPlaysByRecord(spinPlays(EVENING[2]));
const [single] = groupPlaysByRecord(spinPlays(EVENING[0]));

const meta: Meta<typeof SpinRecordGroup> = {
  title: "Spins/SpinRecordGroup",
  component: SpinRecordGroup,
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
  args: { group: innerspeaker },
};

export default meta;
type Story = StoryObj<typeof SpinRecordGroup>;

export const Collapsed: Story = {};

export const Expanded: Story = { args: { defaultExpanded: true } };

export const NoArt: Story = { name: "No art", args: { group: cumbia } };

export const SingleSpin: Story = {
  name: "One spin (a plain track row)",
  args: { group: single },
};
