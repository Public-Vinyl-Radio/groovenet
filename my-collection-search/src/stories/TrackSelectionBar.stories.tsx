import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Text } from "@chakra-ui/react";
import TrackSelectionBar from "@/components/TrackSelectionBar";

const meta: Meta<typeof TrackSelectionBar> = {
  title: "Components/TrackSelectionBar",
  component: TrackSelectionBar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Box position="relative" h="100vh">
        <Box p={6}>
          <Text color="fg.muted" fontSize="sm">
            (Scroll content behind the bar)
          </Text>
        </Box>
        <Story />
      </Box>
    ),
  ],
  args: {
    selectedCount: 5,
    loadedCount: 20,
    downloadableCount: 3,
    onSelectAll: () => {},
    onClear: () => {},
    onEnrich: () => {},
    onDownloadAudio: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof TrackSelectionBar>;

export const Default: Story = {
  name: "Default (5 of 20 selected)",
};

export const WithDownloadable: Story = {
  name: "With downloadable tracks",
  args: {
    selectedCount: 8,
    loadedCount: 20,
    downloadableCount: 5,
  },
};

export const NoDownloadable: Story = {
  name: "No downloadable tracks",
  args: {
    selectedCount: 4,
    loadedCount: 20,
    downloadableCount: 0,
  },
};

export const AllSelected: Story = {
  name: 'All selected (no "Select all" button)',
  args: {
    selectedCount: 20,
    loadedCount: 20,
    downloadableCount: 12,
  },
};

export const Single: Story = {
  name: "Single track selected",
  args: {
    selectedCount: 1,
    loadedCount: 20,
    downloadableCount: 1,
  },
};
