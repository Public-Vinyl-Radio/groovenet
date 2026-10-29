import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import PlaylistStatsPanel from "@/components/PlaylistStatsPanel";
import { queryKeys } from "@/lib/queryKeys";
import type { GenreTreeNode } from "@/api-contract/schemas";
import { sampleTrack, trackWithAudio, trackMinimal } from "./fixtures/track";
import type { Track } from "@/types/track";

// A small taxonomy (#376): "Latin" and "Cumbia" are known, so their badges
// link to track search; "Unmapped Style" has no entry and stays plain.
const TAXONOMY: GenreTreeNode[] = [
  {
    id: "latin",
    name: "Latin",
    slug: "latin",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
  {
    id: "cumbia",
    name: "Cumbia",
    slug: "cumbia",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
  {
    id: "rock",
    name: "Rock",
    slug: "rock",
    parent_id: null,
    source: "discogs",
    track_count: 0,
    album_count: 0,
    children: [],
  },
];

function SeededQueries({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => {
    const seeded = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    seeded.setQueryData(queryKeys.genreTree(), TAXONOMY);
    return seeded;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const withTrackGenres: Track = {
  ...sampleTrack,
  track_id: "stats-1",
  track_genres: [
    { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
  ],
};

const withUnmappedStyle: Track = {
  ...trackWithAudio,
  track_id: "stats-2",
  track_genres: [],
  local_tags: undefined,
  styles: ["Unmapped Style"],
};

const noGenreTrack: Track = {
  ...trackMinimal,
  track_id: "stats-3",
  genres: [],
  styles: [],
  track_genres: [],
  local_tags: undefined,
};

const meta: Meta<typeof PlaylistStatsPanel> = {
  title: "Components/PlaylistStatsPanel",
  component: PlaylistStatsPanel,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <SeededQueries>
        <Box maxW="900px" mx="auto">
          <Story />
        </Box>
      </SeededQueries>
    ),
  ],
  args: {
    tracks: [withTrackGenres, withUnmappedStyle, noGenreTrack],
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistStatsPanel>;

export const Default: Story = {
  name: "Mixed playlist (#480)",
};

export const EmptyPlaylist: Story = {
  name: "No tracks",
  args: { tracks: [] },
};

export const Mobile: Story = {
  name: "Mobile — collapsed summary",
  parameters: { viewport: { defaultViewport: "mobile375" } },
};
