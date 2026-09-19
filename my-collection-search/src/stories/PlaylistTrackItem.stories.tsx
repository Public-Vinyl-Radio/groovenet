import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import PlaylistTrackItem from '@/components/PlaylistTrackItem';
import {
  sampleTrack,
  trackWithAudio,
  trackMinimal,
  trackInPlaylist,
  trackNoEmbeddingNoBpm,
} from './fixtures/track';

const meta: Meta<typeof PlaylistTrackItem> = {
  title: 'Components/PlaylistTrackItem',
  component: PlaylistTrackItem,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto" borderWidth="1px" borderRadius="md" overflow="hidden">
        <Story />
      </Box>
    ),
  ],
  args: {
    track: sampleTrack,
    showUsername: false,
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistTrackItem>;

export const Default: Story = {
};

export const WithAudio: Story = {
  name: 'With audio — hover artwork to play',
  args: { track: trackWithAudio },
};

export const WithUsername: Story = {
  name: 'Show username (friends playlist)',
  args: { showUsername: true },
};

export const DataIssue: Story = {
  name: 'Data issue — missing BPM + embedding',
  args: { track: trackNoEmbeddingNoBpm },
};

export const PositionChange: Story = {
  name: 'Position changed (after GA reorder)',
  args: {
    track: sampleTrack,
    sortPositionChange: { currentPosition: 4, previousPosition: 1 },
  },
};

export const Minimal: Story = {
  name: 'Minimal data',
  args: { track: trackMinimal },
};

export const FullPlaylist: Story = {
  name: 'Full playlist (multiple items)',
  render: (args) => (
    <Box borderWidth="1px" borderRadius="md" overflow="hidden">
      <PlaylistTrackItem {...args} track={sampleTrack} />
      <PlaylistTrackItem {...args} track={trackWithAudio} />
      <PlaylistTrackItem
        {...args}
        track={trackInPlaylist}
        sortPositionChange={{ currentPosition: 3, previousPosition: 1 }}
      />
      <PlaylistTrackItem {...args} track={trackMinimal} />
      <PlaylistTrackItem {...args} track={trackNoEmbeddingNoBpm} />
    </Box>
  ),
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto">
        <Story />
      </Box>
    ),
  ],
};
