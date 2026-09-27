import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box, Stack } from '@chakra-ui/react';
import AlbumSpinRow from '@/components/spins/AlbumSpinRow';
import type { SpinListItem } from '@/components/spins/spinSummary';

const noop = () => {};

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

const meta: Meta<typeof AlbumSpinRow> = {
  title: 'Components/AlbumSpinRow',
  component: AlbumSpinRow,
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
type Story = StoryObj<typeof AlbumSpinRow>;

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
      <AlbumSpinRow {...args} item={autoSpin} />
      <AlbumSpinRow {...args} item={manualTracks} />
      <AlbumSpinRow {...args} item={sideSpin} />
    </Stack>
  ),
};
