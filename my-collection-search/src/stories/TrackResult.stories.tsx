import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import TrackResult, { TrackListHeader } from "@/components/TrackResult";
import {
  sampleTrack,
  trackWithAudio,
  trackMinimal,
  trackInPlaylist,
  trackNoEmbeddingNoBpm,
} from "./fixtures/track";

const meta: Meta<typeof TrackResult> = {
  title: "Components/TrackResult",
  component: TrackResult,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box maxW="1360px" mx="auto" css={{ containerType: "inline-size" }}>
        <Story />
      </Box>
    ),
  ],
  args: {
    track: sampleTrack,
    showUsername: true,
    showRating: true,
    showDetails: true,
    showGenres: true,
    showNotes: true,
    showPlaylistCount: true,
    layout: "card",
  },
};

export default meta;
type Story = StoryObj<typeof TrackResult>;

export const Default: Story = {
  name: "Default (card layout)",
};

export const WithAudio: Story = {
  name: "With audio — hover artwork to play",
  args: {
    track: trackWithAudio,
  },
};

export const RowLayout: Story = {
  name: "Row layout (desktop search results)",
  args: {
    layout: "row",
  },
  decorators: [
    (Story) => (
      <Box maxW="1360px" mx="auto" css={{ containerType: "inline-size" }}>
        <Story />
      </Box>
    ),
  ],
};

export const RowLayoutLongValues: Story = {
  name: "Row layout — long identifier, album, key and genre (#685)",
  args: {
    layout: "row",
    track: {
      ...trackWithAudio,
      album: "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds From Perú 1966 1976)",
      year: "1976",
      library_identifier: "LP-349-DELUXE-BOX-SET",
      position: "B2",
      key: "Bb minor",
      key_confidence: 0.4,
      track_genres: [
        {
          id: "r",
          name: "Rock en Español",
          slug: "rock-en-espanol",
          parent_id: null,
          parent_name: null,
        },
        {
          id: "p",
          name: "Psychedelic Cumbia Instrumental Fusion",
          slug: "psychedelic",
          parent_id: null,
          parent_name: null,
        },
        { id: "e", name: "Electronic", slug: "electronic", parent_id: null, parent_name: null },
      ],
    },
  },
  render: (args) => (
    <Box borderWidth="2px" borderColor="border.ink" overflow="hidden">
      <TrackListHeader />
      <TrackResult {...args} />
    </Box>
  ),
};

export const RowLayoutWithIssues: Story = {
  name: "Row layout — missing BPM + embedding",
  args: {
    track: trackNoEmbeddingNoBpm,
    layout: "row",
  },
  decorators: [
    (Story) => (
      <Box maxW="1360px" mx="auto" css={{ containerType: "inline-size" }}>
        <Story />
      </Box>
    ),
  ],
};

export const WithTrackGenres: Story = {
  name: "Track genres (#470)",
  args: {
    track: {
      ...sampleTrack,
      track_genres: [
        { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
        {
          id: "chicha",
          name: "Chicha",
          slug: "chicha",
          parent_id: "cumbia",
          parent_name: "Cumbia",
        },
      ],
    },
  },
};

export const WithDiscogsFallback: Story = {
  name: "Discogs style fallback, unreconciled track (#470)",
  args: {
    track: {
      ...sampleTrack,
      track_genres: [],
      local_tags: "",
      styles: ["Bossa Nova", "Latin Jazz"],
    },
  },
};

export const WithNoGenres: Story = {
  name: "No genres at all (#470)",
  args: {
    track: { ...sampleTrack, track_genres: [], local_tags: "", styles: [] },
  },
};

export const WithPlaylistCount: Story = {
  name: "With playlist count badge",
  args: {
    playlistCount: 3,
  },
};

export const Selected: Story = {
  name: "Selected (checkbox checked)",
  args: {
    isSelected: true,
    onToggleSelect: () => {},
  },
};

export const HiddenUsername: Story = {
  name: "Username hidden (friend context)",
  args: {
    showUsername: false,
  },
};

export const NoGenres: Story = {
  name: "No genres / minimal data",
  args: {
    track: trackMinimal,
  },
};

export const SemanticScore: Story = {
  name: "With AI similarity score",
  args: {
    track: { ...sampleTrack, _semanticScore: 0.93 },
  },
};

const longCardTrack = {
  ...trackWithAudio,
  title: "Cumbia Beat Experimental Guitar-Driven Tropical Sounds From Perú, Side One Opener",
  artist: "Los Beltons y Su Conjunto Tropical Del Perú",
  album: "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds From Perú 1966 1976)",
  year: "1976",
  library_identifier: "LP-349-DELUXE-BOX-SET",
  position: "B2",
  key: "Bb minor",
  key_confidence: 0.4,
  track_genres: [
    "Rock en Español",
    "Psychedelic Cumbia",
    "Electronic",
    "Funk",
    "Soul",
    "Latin",
  ].map((name, i) => ({
    id: String(i),
    name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    parent_id: null,
    parent_name: null,
  })),
};

export const CardLongValues: Story = {
  name: "Card — long title, artist, ID and 6 genres (#722)",
  args: { track: longCardTrack, footer: <Box>#4 · 12 plays</Box> },
};

export const CardNoBpmKeyOrGenres: Story = {
  name: "Card — no BPM, key or genres (#722)",
  args: {
    track: {
      ...trackMinimal,
      bpm: null,
      key: null,
      track_genres: [],
      local_tags: "",
      styles: [],
      genres: [],
    },
  },
};

export const CardPhone: Story = {
  name: "Card — phone (#722)",
  parameters: { viewport: { defaultViewport: "mobile375" } },
  render: (args) => (
    <Box pr="6px">
      <TrackResult {...args} track={longCardTrack} />
      <TrackResult {...args} track={sampleTrack} />
    </Box>
  ),
};

export const MultipleInList: Story = {
  name: "Multiple tracks (card layout)",
  render: (args) => (
    <Box>
      <TrackResult {...args} track={sampleTrack} />
      <TrackResult {...args} track={trackWithAudio} />
      <TrackResult
        {...args}
        track={trackInPlaylist}
        sortPositionChange={{ currentPosition: 3, previousPosition: 1 }}
      />
      <TrackResult {...args} track={trackNoEmbeddingNoBpm} />
    </Box>
  ),
};

export const MultipleRows: Story = {
  name: "Multiple tracks (row layout)",
  args: { layout: "row" },
  decorators: [
    (Story) => (
      <Box maxW="1360px" mx="auto" css={{ containerType: "inline-size" }}>
        <Story />
      </Box>
    ),
  ],
  render: (args) => (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden">
      <TrackResult {...args} track={sampleTrack} />
      <TrackResult {...args} track={trackWithAudio} />
      <TrackResult {...args} track={trackInPlaylist} />
      <TrackResult {...args} track={trackNoEmbeddingNoBpm} />
    </Box>
  ),
};

export const DenseJobCard: Story = {
  name: "Dense card — jobs page",
  args: {
    density: "dense",
    layout: "card",
    showUsername: false,
    showRating: false,
    showDetails: false,
    showGenres: false,
    showNotes: false,
    showPlaylistCount: false,
    footer: (
      <Box borderTopWidth="1px" pt={2}>
        Job status and actions
      </Box>
    ),
    buttons: <button aria-label="Job details">Details</button>,
  },
};

export const DenseQueueRow: Story = {
  name: "Dense row — queue, clickable with actions",
  args: {
    track: trackWithAudio,
    density: "dense",
    layout: "row",
    onRowClick: () => {},
    buttons: <button aria-label="Remove track">Remove</button>,
  },
};

export const DenseSelectedCard: Story = {
  name: "Dense card — selected with genre badges",
  args: {
    density: "dense",
    layout: "card",
    isSelected: true,
    onToggleSelect: () => {},
    track: {
      ...sampleTrack,
      track_genres: [
        { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
      ],
      local_tags: "Psychedelic Cumbia",
    },
  },
};
