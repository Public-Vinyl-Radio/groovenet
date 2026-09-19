import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box } from '@chakra-ui/react';
import { FiVolume2, FiVolumeX } from 'react-icons/fi';
import PlayerControlsView from '@/components/player/PlayerControlsView';
import { sampleTrack } from './fixtures/track';

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

export const Compact: Story = {
  name: 'Compact (mobile drawer)',
  args: {
    compact: true,
    isPlaying: false,
  },
  decorators: [
    (Story) => (
      <Box maxW="400px" mx="auto" borderWidth="1px" borderRadius="md" p={3}>
        <Story />
      </Box>
    ),
  ],
};

export const CompactPlaying: Story = {
  name: 'Compact — playing',
  args: {
    compact: true,
    isPlaying: true,
    canNext: true,
  },
  decorators: [
    (Story) => (
      <Box maxW="400px" mx="auto" borderWidth="1px" borderRadius="md" p={3}>
        <Story />
      </Box>
    ),
  ],
};
