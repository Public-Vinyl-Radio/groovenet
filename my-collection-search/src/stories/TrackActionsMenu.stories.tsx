import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import TrackActionsMenu from "@/components/TrackActionsMenu";
import { sampleTrack, trackWithAudio, trackMinimal } from "./fixtures/track";

const meta: Meta<typeof TrackActionsMenu> = {
  title: "Components/TrackActionsMenu",
  component: TrackActionsMenu,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box p={4}>
        <Story />
      </Box>
    ),
  ],
  args: {
    track: sampleTrack,
  },
};

export default meta;
type Story = StoryObj<typeof TrackActionsMenu>;

export const Default: Story = {
  name: "Default (no audio, streaming links only)",
};

export const WithAudio: Story = {
  name: "With local audio (Play action visible)",
  args: { track: trackWithAudio },
};

export const WithDebugAction: Story = {
  name: "With debug action",
  args: { onOpenTrackDebug: () => {} },
};

export const NoStreamingLinks: Story = {
  name: "No streaming links (minimal)",
  args: { track: trackMinimal },
};

export const EditContext: Story = {
  name: "Edit context (hideEdit + form-aware audio actions)",
  args: {
    track: trackWithAudio,
    hideEdit: true,
    audioActions: {
      onFetchAudio: () => {},
      onUploadFile: () => {},
      onRemoveAudio: () => {},
    },
  },
};

export const AllActions: Story = {
  name: "All actions (grouping: primary / audio / destructive / links)",
  args: {
    track: trackWithAudio,
    onOpenTrackDebug: () => {},
    onChangeArtwork: () => {},
  },
};
