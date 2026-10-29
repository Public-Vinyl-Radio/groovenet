import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Button } from "@chakra-ui/react";
import AlbumTracklist from "@/components/album-detail/AlbumTracklist";
import { summarizeSides } from "@/lib/albumStats";
import { sampleTrack } from "./fixtures/track";

const longTitle = "You Probably Couldn't See For The Lights But You Were Staring Straight At Me";
const genres = [
  "Garage Rock",
  "Indie Rock",
  "Psychedelic Rock With An Exceptionally Long Genre Name",
].map((name, index) => ({
  id: `genre-${index}`,
  name,
  slug: `genre-${index}`,
  parent_id: null,
  parent_name: null,
}));
const tracks = ["The View From The Afternoon", longTitle].map((title, index) => ({
  ...sampleTrack,
  track_id: `long-title-${index}`,
  title,
  position: `A${index + 1}`,
  artist: "Arctic Monkeys",
  key: "F# minor",
  track_genres: genres,
  notes: "The notes button must stay visible beside a truncated title.",
}));

const meta: Meta<typeof AlbumTracklist> = {
  title: "Components/AlbumTracklist",
  component: AlbumTracklist,
  // This presentational component only needs links, not the App Router boundary.
  parameters: { layout: "padded", nextjs: { appDirectory: false } },
  decorators: [
    (Story) => (
      <Box minW={0} maxW="1200px">
        <Story />
      </Box>
    ),
  ],
  args: {
    sides: summarizeSides(tracks),
    albumArtist: "Arctic Monkeys",
    isMobile: false,
    onPlayTrack: () => {},
    onPlaySide: () => {},
    renderActions: (track) => (
      <Button size="xs" variant="ghost" aria-label={`Actions for ${track.title}`}>
        …
      </Button>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof AlbumTracklist>;

export const LongTitles: Story = {};

export const NarrowDesktop: Story = {
  decorators: [
    (Story) => (
      <Box w="984px">
        <Story />
      </Box>
    ),
  ],
};

export const LongGenre: Story = {
  args: {
    sides: summarizeSides(
      tracks.map((track) => ({
        ...track,
        track_genres: [genres[2], genres[1], genres[0]],
      })),
    ),
  },
};

export const Phone: Story = {
  args: { isMobile: true },
  decorators: [
    (Story) => (
      <Box w="360px">
        <Story />
      </Box>
    ),
  ],
};
