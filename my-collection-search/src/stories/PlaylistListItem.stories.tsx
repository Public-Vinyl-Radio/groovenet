import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box, Stack } from '@chakra-ui/react';
import PlaylistListItem from '@/components/PlaylistListItem';
import PlaylistMonthGrid from '@/components/PlaylistMonthGrid';
import PlaylistMonthDivider, { TimelineRow } from '@/components/PlaylistMonthDivider';
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

const withCovers = (count: number): Playlist =>
  ({
    ...samplePlaylist,
    // Expected from the list endpoint (#771); not in the contract yet.
    cover_urls: ['/cover1.jpg', '/cover2.jpg', '/cover3.jpg', '/cover4.jpg'].slice(0, count),
  }) as Playlist;

export const CoverMosaic: Story = {
  name: 'Cover mosaic (partial covers tint the rest)',
  render: (args) => (
    <Stack gap={3}>
      <PlaylistListItem {...args} playlist={withCovers(4)} />
      <PlaylistListItem {...args} playlist={withCovers(2)} />
      <PlaylistListItem {...args} playlist={withCovers(0)} />
    </Stack>
  ),
};

export const WithCollaborator: Story = {
  args: {
    playlist: {
      ...longNamePlaylist,
      set: { status: 'planned', collaborators: [{ username: 'ana' }], venue_name: null },
    } as unknown as Playlist,
  },
};

const liveSet = (set: Record<string, unknown>): Playlist =>
  ({
    ...samplePlaylist,
    name: 'Friday at Room 4',
    cover_urls: ['/cover1.jpg', '/cover2.jpg', '/cover3.jpg', '/cover4.jpg'],
    set: {
      id: 1,
      title: null,
      status: 'performed',
      cover_image_url: null,
      last_performed_at: '2026-08-10T22:00:00.000Z',
      venue_name: 'Room 4',
      location_city: 'Oakland',
      collaborators: [],
      flyer_url: null,
      recording_url: null,
      post_url: null,
      youtube_url: null,
      ...set,
    },
  }) as Playlist;

export const LiveSetTicket: Story = {
  name: 'Live set ticket (flyer, venue, all links)',
  args: {
    playlist: liveSet({
      flyer_url: '/flyer.jpg',
      recording_url: 'https://example.com/recording',
      post_url: 'https://example.com/post',
      youtube_url: 'https://youtube.com/watch?v=x',
    }),
  },
};

export const LiveSetTicketNoFlyer: Story = {
  name: 'Live set ticket (no flyer: mosaic, recording only)',
  args: { playlist: liveSet({ recording_url: 'https://example.com/recording' }) },
};

export const LiveSetTicketNoVenue: Story = {
  name: 'Live set ticket (no venue, post + YouTube)',
  args: {
    playlist: liveSet({
      venue_name: null,
      location_city: null,
      post_url: 'https://example.com/post',
      youtube_url: 'https://youtube.com/watch?v=x',
    }),
  },
};

export const LiveSetTicketBare: Story = {
  name: 'Live set ticket (no venue or links: no stub)',
  args: { playlist: liveSet({ venue_name: null, location_city: null }) },
};

const timelineDays = [
  { day: '10', weekday: 'MON' },
  { day: '5', weekday: 'WED' },
  { day: '2', weekday: 'SUN' },
];

export const PhoneTimeline: Story = {
  name: 'Month group on a phone (day column and rail)',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [
    (Story) => (
      <Box maxW="390px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  render: (args) => (
    <Box as="section" aria-label="AUG 2026">
      <PlaylistMonthDivider
        group={{ key: '2026-08', label: 'AUG 2026', playlists: [], playlistCount: 3, setCount: 1 }}
      />
      <Stack gap={3}>
        {[samplePlaylist, liveSet({ recording_url: 'https://example.com/recording' }), oldPlaylist].map((pl, i) => (
          <TimelineRow key={pl.id} day={timelineDays[i]} isFirst={i === 0} isLast={i === 2}>
            <PlaylistListItem {...args} playlist={pl} dayLabel={`${timelineDays[i].weekday} ${timelineDays[i].day}`} />
          </TimelineRow>
        ))}
      </Stack>
    </Box>
  ),
};

export const PhoneTimelineMissingDate: Story = {
  name: 'Day column with a missing date (rail only)',
  decorators: PhoneTimeline.decorators,
  render: (args) => (
    <Stack gap={3}>
      <TimelineRow day={null} isFirst isLast>
        <PlaylistListItem {...args} playlist={samplePlaylist} />
      </TimelineRow>
    </Stack>
  ),
};

const gridSet = (id: number, title: string, set: Record<string, unknown>): Playlist => ({ ...liveSet(set), id, name: title });

export const DesktopMonthGrid: Story = {
  name: 'Desktop month grid (sets taller, cards top-aligned)',
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'desktop' } },
  decorators: [
    (Story) => (
      <Box maxW="1200px" mx="auto" p={6}>
        <Story />
      </Box>
    ),
  ],
  render: (args) => (
    <PlaylistMonthGrid>
      <PlaylistListItem {...args} playlist={{ ...samplePlaylist, id: 10 }} dayLabel="TUE 20" />
      <PlaylistListItem
        {...args}
        dayLabel="MON 10"
        playlist={gridSet(11, 'Inner Signals', {
          flyer_url: '/flyer.jpg',
          recording_url: 'https://example.com/recording',
          post_url: 'https://example.com/post',
          youtube_url: 'https://youtube.com/watch?v=x',
        })}
      />
      <PlaylistListItem {...args} playlist={{ ...longNamePlaylist, id: 12 }} dayLabel="FRI 24" />
      <PlaylistListItem {...args} dayLabel="MON 03" playlist={gridSet(13, 'Flow State', { recording_url: 'https://example.com/r' })} />
    </PlaylistMonthGrid>
  ),
};
