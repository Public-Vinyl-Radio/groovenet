import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box, Stack } from '@chakra-ui/react';
import PlaylistListItem from '@/components/PlaylistListItem';
import type { Playlist } from '@/types/track';

const noop = () => {};

const samplePlaylist: Playlist = {
  id: 1,
  name: 'Late Night Cumbia',
  tracks: [
    { track_id: '33416876-B7', friend_id: 6, position: 1 },
    { track_id: '13437015-B4', friend_id: 6, position: 2 },
    { track_id: '22969529-B4', friend_id: 6, position: 3 },
    { track_id: '33416876-D3', friend_id: 6, position: 4 },
    { track_id: '33416876-D7', friend_id: 6, position: 5 },
  ],
  created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
};

const longNamePlaylist: Playlist = {
  id: 2,
  name: 'Psychedelic Cumbia / Global Groove — Peak Time Selections Vol. 2',
  tracks: Array.from({ length: 22 }, (_, i) => ({
    track_id: `track-${i}`,
    friend_id: 6,
    position: i + 1,
  })),
  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
};

const emptyPlaylist: Playlist = {
  id: 3,
  name: 'Empty Playlist',
  tracks: [],
  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
};

const oldPlaylist: Playlist = {
  id: 4,
  name: 'Salsa Classics',
  tracks: Array.from({ length: 12 }, (_, i) => ({
    track_id: `salsa-${i}`,
    friend_id: 6,
    position: i + 1,
  })),
  created_at: '2024-03-15T20:00:00.000Z',
};

const meta: Meta<typeof PlaylistListItem> = {
  title: 'Components/PlaylistListItem',
  component: PlaylistListItem,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box maxW="600px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  args: {
    playlist: samplePlaylist,
    onClick: noop,
    onPlay: noop,
    onDelete: noop,
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistListItem>;

export const Default: Story = {
};

export const Loading: Story = {
  name: 'Loading (spinner shown)',
  args: { isLoading: true },
};

export const LongName: Story = {
  name: 'Long playlist name (truncated)',
  args: { playlist: longNamePlaylist },
};

export const ManyTracks: Story = {
  name: 'Many tracks (22)',
  args: { playlist: longNamePlaylist },
};

export const Empty: Story = {
  name: 'Empty playlist (0 tracks)',
  args: { playlist: emptyPlaylist },
};

export const OldDate: Story = {
  name: 'Older date (relative display)',
  args: { playlist: oldPlaylist },
};

export const List: Story = {
  name: 'List of playlists',
  render: (args) => (
    <Stack gap={2}>
      <PlaylistListItem {...args} playlist={samplePlaylist} />
      <PlaylistListItem {...args} playlist={longNamePlaylist} />
      <PlaylistListItem {...args} playlist={oldPlaylist} />
      <PlaylistListItem {...args} playlist={emptyPlaylist} />
    </Stack>
  ),
};
