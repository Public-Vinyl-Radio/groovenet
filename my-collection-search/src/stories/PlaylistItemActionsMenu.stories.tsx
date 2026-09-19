import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import PlaylistItemActionsMenu from '@/components/PlaylistItemActionsMenu';

const noop = () => {};

const meta: Meta<typeof PlaylistItemActionsMenu> = {
  title: 'Components/PlaylistItemActionsMenu',
  component: PlaylistItemActionsMenu,
  parameters: { layout: 'centered' },
  args: {
    playlistName: 'Late Night Cumbia',
    onPlay: noop,
    onDelete: noop,
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistItemActionsMenu>;

export const Default: Story = {
};

export const LongName: Story = {
  name: 'Long playlist name',
  args: {
    playlistName: 'Psychedelic Cumbia / Global Groove — Peak Time Selections Vol. 2',
  },
};
