import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import PlayerControlsView from '@/components/player/PlayerControlsView';
import { sampleTrack, trackLongTitle, trackNoArtwork } from './fixtures/track';

const noop = () => {};
const noopAsync = async () => {};

const baseArgs = {
  showQueueButton: true,
  isQueueOpen: false,
  compact: false,
  showVolumeControls: true,
  isPlaying: false,
  currentTrack: sampleTrack,
  safeLen: 1,
  canPrev: false,
  canNext: true,
  playPrev: noop,
  playNext: noop,
  volume: 0.8,
  setVolume: noop,
  VolumeIcon: FiVolume2,
  isAirPlayAvailable: false,
  isAirPlayActive: false,
  onAirPlayClick: noop,
  onPlay: noop,
  onPause: noop,
  onSeek: noopAsync,
  onClosePlayer: noop,
  onDismissPlayer: noop,
};

const meta: Meta<typeof PlayerControlsView> = {
  title: 'Components/PlayerControlsView',
  component: PlayerControlsView,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box maxW="900px" mx="auto" borderWidth="1px" borderRadius="md" p={4}>
        <Story />
      </Box>
    ),
  ],
  args: baseArgs,
};

export default meta;
type Story = StoryObj<typeof PlayerControlsView>;

export const Paused: Story = {
  name: 'Paused — track loaded',
  args: { isPlaying: false },
};

export const Playing: Story = {
  args: { isPlaying: true },
};

export const MidQueue: Story = {
  name: 'Mid-queue (prev + next enabled)',
  args: {
    isPlaying: true,
    canPrev: true,
    canNext: true,
  },
};

export const Muted: Story = {
  args: {
    volume: 0,
    VolumeIcon: FiVolumeX,
  },
};

export const WithAirPlay: Story = {
  name: 'AirPlay available',
  args: {
    isAirPlayAvailable: true,
    isAirPlayActive: false,
  },
};

export const AirPlayActive: Story = {
  name: 'AirPlay active',
  args: {
    isAirPlayAvailable: true,
    isAirPlayActive: true,
    isPlaying: true,
  },
};

export const QueueOpen: Story = {
  name: 'Queue panel open',
  args: {
    isQueueOpen: true,
    showQueueButton: true,
  },
};

export const NoTrack: Story = {
  name: 'No track loaded',
  args: {
    currentTrack: null,
    safeLen: 0,
    canPrev: false,
    canNext: false,
  },
};

export const LongTitle: Story = {
  name: 'Long title (truncates, no wrap)',
  args: {
    currentTrack: trackLongTitle,
    isPlaying: true,
  },
};

export const QueueFinished: Story = {
  name: 'Queue finished',
  args: {
    isQueueFinished: true,
    currentTrack: sampleTrack,
    isPlaying: false,
    canPrev: false,
    canNext: false,
    safeLen: 3,
  },
};

const compactDecorator: Meta<typeof PlayerControlsView>['decorators'] = [
  (Story) => (
    <Box maxW="400px" mx="auto" borderWidth="1px" borderRadius="md" p={3}>
      <Story />
    </Box>
  ),
];

export const Compact: Story = {
  name: 'Compact (mobile drawer)',
  args: {
    compact: true,
    isPlaying: false,
  },
  decorators: compactDecorator,
};

export const CompactPlaying: Story = {
  name: 'Compact — playing',
  args: {
    compact: true,
    isPlaying: true,
    canNext: true,
  },
  decorators: compactDecorator,
};

export const CompactNoTrack: Story = {
  name: 'Compact — no track',
  args: {
    compact: true,
    currentTrack: null,
    isPlaying: false,
    safeLen: 0,
    canPrev: false,
    canNext: false,
  },
  decorators: compactDecorator,
};

export const CompactQueueFinished: Story = {
  name: 'Compact — queue finished',
  args: {
    compact: true,
    isQueueFinished: true,
    currentTrack: sampleTrack,
    isPlaying: false,
    canPrev: false,
    canNext: false,
    safeLen: 3,
  },
  decorators: compactDecorator,
};

export const CompactNoArtwork: Story = {
  name: 'Compact — no artwork',
  args: {
    compact: true,
    currentTrack: trackNoArtwork,
    isPlaying: false,
  },
  decorators: compactDecorator,
};

export const CompactLongTitle: Story = {
  name: 'Compact — long title',
  args: {
    compact: true,
    currentTrack: trackLongTitle,
    isPlaying: true,
    canNext: true,
  },
  decorators: compactDecorator,
};
