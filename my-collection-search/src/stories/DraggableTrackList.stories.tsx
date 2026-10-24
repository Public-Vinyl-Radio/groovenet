import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import DraggableTrackList from '@/components/DraggableTrackList';
import { sampleTrack, trackWithAudio, trackMinimal } from './fixtures/track';

const meta: Meta<typeof DraggableTrackList> = {
  title: 'Components/DraggableTrackList',
  component: DraggableTrackList,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof DraggableTrackList>;

const tracks = [sampleTrack, trackWithAudio, trackMinimal];

function Playlist({ layout, current }: { layout: 'row' | 'card'; current?: number }) {
  const [order, setOrder] = useState(tracks.map((t) => ({ track_id: t.track_id, friend_id: t.friend_id! })));
  const moveTrack = (from: number, to: number) =>
    setOrder((prev) => {
      const next = [...prev];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });
  return (
    <Box maxW="1360px" mx="auto">
      <DraggableTrackList
        tracksPlaylist={order}
        tracks={tracks}
        moveTrack={moveTrack}
        droppableId={`story-${layout}`}
        currentTrackIndex={current}
        trackResultProps={{ layout, onRowClick: () => undefined }}
      />
    </Box>
  );
}

/** Playlist as one outlined table: header, numbered rows, drag to reorder; the dragged row carries its own outline. */
export const Rows: Story = { render: () => <Playlist layout="row" current={1} /> };

export const Cards: Story = { render: () => <Playlist layout="card" /> };
