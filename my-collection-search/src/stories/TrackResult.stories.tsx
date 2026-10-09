import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import TrackResult from '@/components/TrackResult';
import {
  sampleTrack,
  trackWithAudio,
  trackMinimal,
  trackInPlaylist,
  trackNoEmbeddingNoBpm,
} from './fixtures/track';

const meta: Meta<typeof TrackResult> = {
  title: 'Components/TrackResult',
  component: TrackResult,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto">
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
    playlistMode: false,
  },
};

export default meta;
type Story = StoryObj<typeof TrackResult>;

export const Default: Story = {
  name: 'Default (full view)',
};

export const WithAudio: Story = {
  name: 'With audio — hover artwork to play',
  args: {
    track: trackWithAudio,
  },
};

export const PlaylistMode: Story = {
  name: 'Playlist mode',
  args: {
    track: sampleTrack,
    playlistMode: true,
  },
};

export const PlaylistModeWithIssues: Story = {
  name: 'Playlist mode — missing BPM + embedding',
  args: {
    track: trackNoEmbeddingNoBpm,
    playlistMode: true,
  },
};

export const PlaylistModeWithTrackGenres: Story = {
  name: 'Playlist mode — track genres (#470)',
  args: {
    track: {
      ...sampleTrack,
      track_genres: [
        { id: 'cumbia', name: 'Cumbia', slug: 'cumbia', parent_id: null, parent_name: null },
        { id: 'chicha', name: 'Chicha', slug: 'chicha', parent_id: 'cumbia', parent_name: 'Cumbia' },
      ],
    },
    playlistMode: true,
  },
};

export const PlaylistModeWithDiscogsFallback: Story = {
  name: 'Playlist mode — Discogs style fallback, unreconciled track (#470)',
  args: {
    track: { ...sampleTrack, track_genres: [], local_tags: '', styles: ['Bossa Nova', 'Latin Jazz'] },
    playlistMode: true,
  },
};

export const PlaylistModeWithNoGenres: Story = {
  name: 'Playlist mode — no genres at all (#470)',
  args: {
    track: { ...sampleTrack, track_genres: [], local_tags: '', styles: [] },
    playlistMode: true,
  },
};

export const WithPlaylistCount: Story = {
  name: 'With playlist count badge',
  args: {
    playlistCount: 3,
  },
};

export const Selected: Story = {
  name: 'Selected (checkbox checked)',
  args: {
    isSelected: true,
    onToggleSelect: () => {},
  },
};

export const HiddenUsername: Story = {
  name: 'Username hidden (friend context)',
  args: {
    showUsername: false,
  },
};

export const NoGenres: Story = {
  name: 'No genres / minimal data',
  args: {
    track: trackMinimal,
  },
};

export const SemanticScore: Story = {
  name: 'With AI similarity score',
  args: {
    track: { ...sampleTrack, _semanticScore: 0.93 },
  },
};

export const MultipleInList: Story = {
  name: 'Multiple tracks (list view)',
  render: (args) => (
    <Box>
      <TrackResult {...args} track={sampleTrack} />
      <TrackResult {...args} track={trackWithAudio} />
      <TrackResult {...args} track={trackInPlaylist} />
      <TrackResult {...args} track={trackMinimal} />
    </Box>
  ),
};

export const MultiplePlaylistMode: Story = {
  name: 'Multiple tracks (playlist mode)',
  args: { playlistMode: true },
  render: (args) => (
    <Box>
      <TrackResult {...args} track={sampleTrack} />
      <TrackResult {...args} track={trackWithAudio} />
      <TrackResult {...args} track={trackInPlaylist} sortPositionChange={{ currentPosition: 3, previousPosition: 1 }} />
      <TrackResult {...args} track={trackNoEmbeddingNoBpm} />
    </Box>
  ),
};
