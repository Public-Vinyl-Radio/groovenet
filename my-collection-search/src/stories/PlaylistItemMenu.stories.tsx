import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import { PlaylistItemMenu } from "@/components/PlaylistItemMenu";
import { sampleTrack, trackWithAudio, trackMinimal } from "./fixtures/track";

const noop = () => {};

const meta: Meta<typeof PlaylistItemMenu> = {
  title: "Components/PlaylistItemMenu",
  component: PlaylistItemMenu,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box p={4}>
        <Story />
      </Box>
    ),
  ],
  args: {
    idx: 2,
    total: 10,
    track: sampleTrack,
    moveTrack: noop,
    removeFromPlaylist: noop,
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistItemMenu>;

export const Default: Story = {
  name: "Mid-playlist (move up + down enabled)",
};

export const FirstTrack: Story = {
  name: "First track (move up disabled)",
  args: { idx: 0, total: 10 },
};

export const LastTrack: Story = {
  name: "Last track (move down disabled)",
  args: { idx: 9, total: 10 },
};

export const OnlyTrack: Story = {
  name: "Only track (both move disabled)",
  args: { idx: 0, total: 1 },
};

export const WithAudio: Story = {
  name: "Has local audio (no Fetch Audio action)",
  args: { track: trackWithAudio },
};

export const NoStreamingLinks: Story = {
  name: "No streaming links (no Fetch Audio action)",
  args: { track: trackMinimal },
};

export const SmallSize: Story = {
  name: "Size sm (playlist track item context)",
  args: { size: "sm" },
};
