import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import PlaylistActionsMenu from '@/components/PlaylistActionsMenu';

const noop = () => {};

const meta: Meta<typeof PlaylistActionsMenu> = {
  title: 'Components/PlaylistActionsMenu',
  component: PlaylistActionsMenu,
  parameters: { layout: 'centered' },
  args: {
    playlistName: 'Late Night Cumbia',
    onSortGreedy: noop,
    onSortGenetic: noop,
    onSortCohesiveBlocks: noop,
    onExportJson: noop,
    onImportJson: noop,
    onExportPdf: noop,
    onOpenSaveDialog: noop,
    enqueuePlaylist: noop,
    onDuplicate: noop,
    onRename: noop,
    onOpenRecommendations: noop,
  },
};

export default meta;
type Story = StoryObj<typeof PlaylistActionsMenu>;

export const Default: Story = {
  name: 'Default (all actions)',
};

export const GeneticSorting: Story = {
  name: 'Genetic sort in progress',
  args: { isGeneticSorting: true },
};

export const CohesiveSorting: Story = {
  name: 'Cohesive blocks sort in progress',
  args: { isCohesiveBlocksSorting: true },
};

export const Minimal: Story = {
  name: 'Minimal (no optional actions)',
  args: {
    onDuplicate: undefined,
    onRename: undefined,
    onOpenRecommendations: undefined,
  },
};

export const Disabled: Story = {
  name: 'Disabled (empty playlist)',
  args: { disabled: true },
};

export const LongPlaylistName: Story = {
  name: 'Long playlist name',
  args: { playlistName: 'Psychedelic Cumbia / Global Groove — Peak Time Selections Vol. 2' },
};
