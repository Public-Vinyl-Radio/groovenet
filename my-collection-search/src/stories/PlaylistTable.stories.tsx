import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import PlaylistTable from '@/components/PlaylistTable';
import { groupPlaylistsByMonth } from '@/lib/playlistGroups';
import type { Playlist } from '@/types/track';

const noop = () => {};
const getActions = () => ({ onClick: noop, onPlay: noop, onDelete: noop, onEnqueue: noop, onExportPdf: noop, onCreateSet: noop });

const plain = (id: number, name: string, created_at: string, extra: Record<string, unknown> = {}): Playlist =>
  ({
    id,
    name,
    tracks: Array.from({ length: 12 + id }, (_, i) => ({ track_id: `t${id}-${i}`, friend_id: 1, position: i + 1 })),
    total_duration_seconds: 3600 + id * 600,
    cover_urls: ['/cover1.jpg', '/cover2.jpg', '/cover3.jpg', '/cover4.jpg'],
    created_at,
    ...extra,
  }) as unknown as Playlist;

const liveSet = (id: number, name: string, created_at: string, set: Record<string, unknown>): Playlist =>
  plain(id, name, created_at, {
    set: {
      id,
      title: null,
      status: 'performed',
      cover_image_url: null,
      last_performed_at: created_at,
      venue_name: 'Room 4',
      location_city: 'Oakland',
      collaborators: [],
      flyer_url: null,
      recording_url: null,
      post_url: null,
      youtube_url: null,
      ...set,
    },
  });

const allLinks = {
  flyer_url: '/flyer.jpg',
  recording_url: 'https://example.com/recording',
  post_url: 'https://example.com/post',
  youtube_url: 'https://youtube.com/watch?v=x',
};

const meta: Meta<typeof PlaylistTable> = {
  title: 'Components/PlaylistTable',
  component: PlaylistTable,
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'desktop' } },
  decorators: [
    (Story) => (
      <Box maxW="1200px" mx="auto" p={6}>
        <Story />
      </Box>
    ),
  ],
  args: { getActions },
};

export default meta;
type Story = StoryObj<typeof PlaylistTable>;

export const PlainPlaylists: Story = {
  args: {
    groups: groupPlaylistsByMonth([
      plain(1, 'Cumbia Hi-Energy (~60 min)', '2026-10-20T12:00:00'),
      plain(2, 'CAMILO', '2026-10-11T12:00:00'),
    ]),
  },
};

export const SetsWithAllLinks: Story = {
  args: {
    groups: groupPlaylistsByMonth([
      liveSet(3, 'Inner Signals', '2026-08-10T22:00:00', { ...allLinks, collaborators: [{ username: 'saegey' }] }),
      liveSet(4, 'FLOW STATE', '2026-08-03T22:00:00', allLinks),
    ]),
  },
};

export const SetWithNoLinks: Story = {
  args: { groups: groupPlaylistsByMonth([liveSet(5, 'Friday at Room 4', '2026-08-10T22:00:00', {})]) },
};

export const NoCollaborator: Story = {
  args: {
    groups: groupPlaylistsByMonth([
      plain(6, 'Solo crate', '2026-07-24T12:00:00'),
      liveSet(7, 'Duo night', '2026-07-11T22:00:00', { collaborators: [{ username: 'ana' }, { username: 'ben' }], recording_url: 'https://example.com/r' }),
    ]),
  },
};

export const ManyMonths: Story = {
  args: {
    groups: groupPlaylistsByMonth([
      plain(10, 'Oct', '2026-10-20T12:00:00'),
      liveSet(11, 'Aug set', '2026-08-10T22:00:00', allLinks),
      plain(12, 'Jul A', '2026-07-24T12:00:00'),
      plain(13, 'Jul B', '2026-07-11T12:00:00'),
      plain(14, 'May', '2026-05-29T12:00:00'),
      plain(15, 'Feb A', '2026-02-17T12:00:00'),
      plain(16, 'Feb B', '2026-02-12T12:00:00'),
      plain(17, 'No date', 'not a date'),
    ]),
  },
};

export const Narrow: Story = {
  name: 'Narrow (With and Set links drop off)',
  decorators: [
    (Story) => (
      <Box maxW="640px" mx="auto" p={6}>
        <Story />
      </Box>
    ),
  ],
  args: ManyMonths.args,
};
