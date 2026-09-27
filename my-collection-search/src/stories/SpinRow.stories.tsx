import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box, Stack } from '@chakra-ui/react';
import SpinRow from '@/components/spins/SpinRow';
import type { SpinListItem } from '@/components/spins/spinSummary';

const noop = () => {};

// Inline so the story needs no network.
const SAMPLE_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c2410c"/><stop offset="1" stop-color="#166534"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><circle cx="24" cy="24" r="9" fill="#111"/><circle cx="24" cy="24" r="2" fill="#eee"/></svg>'
  );

type Event = SpinListItem['track_events'][number];

function event(ordinal: number, position: string, title: string): Event {
  return {
    friend_id: 6,
    release_id: '33416876',
    track_id: `33416876-${position}`,
    played_at: '2026-09-20T21:30:00.000Z',
    ordinal,
    side_key: position[0],
    position_snapshot: position,
    title_snapshot: title,
    artist_snapshot: 'Mexican Institute Of Sound',
    album_snapshot: 'Algo-Ritmo (Hits 2004–2024)',
  };
}

function spin(
  id: number,
  session: Partial<SpinListItem['session']>,
  events: Event[],
  sideKeys: string[] = []
): SpinListItem {
  return {
    session: {
      id,
      friend_id: 6,
      release_id: '33416876',
      medium: 'vinyl',
      selection_mode: 'automatic',
      played_at: '2026-09-20T21:30:00.000Z',
      provenance: 'automatic',
      confidence: null,
      note: null,
      context_type: null,
      created_at: '2026-09-20T21:30:00.000Z',
      updated_at: '2026-09-20T21:30:00.000Z',
      ...session,
    },
    selections: sideKeys.map((side_key, ordinal) => ({
      ordinal,
      selection_type: 'side' as const,
      side_key,
    })),
    track_events: events,
    album: {
      title: 'Algo-Ritmo (Hits 2004–2024)',
      artist: 'Mexican Institute Of Sound',
      thumbnail: SAMPLE_ART,
    },
    derived: {
      is_full_album_spin: false,
      selected_side_count: sideKeys.length,
      album_side_count: 0,
      track_count: events.length,
    },
  };
}

const autoSpin = spin(1, { confidence: 0.92 }, [event(0, 'D2', 'Tipo Raro')]);

const manualTracks = spin(
  2,
  {
    selection_mode: 'tracks',
    provenance: 'manual',
    played_at: '2026-09-20T21:14:00.000Z',
    context_type: 'home',
    note: 'Tried the D-side run back to back — Bolero into Tipo Raro works.',
  },
  [
    event(0, 'D1', 'Bolero'),
    event(1, 'D2', 'Tipo Raro'),
    event(2, 'D3', 'Cumbia'),
    event(3, 'D4', 'Se Baila Asi'),
  ]
);

const sideSpin = spin(
  3,
  { selection_mode: 'sides', provenance: 'manual', context_type: 'gig' },
  [
    event(0, 'A1', 'Mexico'),
    event(1, 'A2', 'Yo Digo Baila'),
    event(2, 'A3', 'Mirando A Las Muchachas'),
    event(3, 'B1', 'Alocatel'),
  ],
  ['A', 'B']
);

// A spin whose album row is gone and whose art never resolved: falls back to
// the event snapshots and a disc icon.
const noArtSpin: SpinListItem = {
  ...spin(4, { played_at: '2026-09-20T20:02:00.000Z', confidence: 0.81 }, [
    event(0, 'A6', 'Hermanos'),
  ]),
  album: null,
};

const meta: Meta<typeof SpinRow> = {
  title: 'Components/SpinRow',
  component: SpinRow,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box maxW="900px" mx="auto" borderWidth="1px" borderRadius="md">
        <Story />
      </Box>
    ),
  ],
  args: {
    item: autoSpin,
    onDelete: noop,
    deletePending: false,
  },
};

export default meta;
type Story = StoryObj<typeof SpinRow>;

export const Automatic: Story = {
  name: 'Detected by the listener',
};

export const ManualTracks: Story = {
  name: 'Logged by hand, several tracks, with a note',
  args: { item: manualTracks },
};

export const Sides: Story = {
  name: 'Logged by side',
  args: { item: sideSpin },
};

export const List: Story = {
  name: 'Album spin list',
  render: (args) => (
    <Stack gap={0}>
      <SpinRow {...args} item={autoSpin} />
      <SpinRow {...args} item={manualTracks} />
      <SpinRow {...args} item={sideSpin} />
    </Stack>
  ),
};

export const RecentSpins: Story = {
  name: 'Recent spins (with album, time only)',
  render: (args) => (
    <Stack gap={0}>
      <SpinRow {...args} item={autoSpin} showAlbum timeOnly />
      <SpinRow {...args} item={manualTracks} showAlbum timeOnly />
      <SpinRow {...args} item={noArtSpin} showAlbum timeOnly />
    </Stack>
  ),
};
