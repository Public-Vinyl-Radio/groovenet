import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import ListeningSessionCard from "@/components/spins/ListeningSessionCard";
import { groupListeningSessions } from "@/components/spins/spinSummary";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { EVENING } from "./fixtures/listeningLog";

const [mixed] = groupListeningSessions(EVENING);
const [vinylOnly] = groupListeningSessions(EVENING.slice(1));

const meta: Meta<typeof ListeningSessionCard> = {
  title: "Spins/ListeningSessionCard",
  component: ListeningSessionCard,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
          <Box maxW="720px" pr="6px" pb="6px">
            <Story />
          </Box>
        </DisplayTimeZoneProvider>
      </QueryClientProvider>
    ),
  ],
  args: { session: mixed },
};

export default meta;
type Story = StoryObj<typeof ListeningSessionCard>;

export const Mixed: Story = { name: "Vinyl and digital" };

export const Vinyl: Story = { args: { session: vinylOnly } };
