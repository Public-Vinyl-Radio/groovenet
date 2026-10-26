import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { Button } from '@chakra-ui/react';
import FilterChips, { FilterGroup, type FilterChip } from '@/components/FilterChips';

const meta: Meta<typeof FilterChips> = {
  title: 'Components/FilterChips',
  component: FilterChips,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto">
        <Story />
      </Box>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FilterChips>;

const searchFilters: FilterChip[] = [
  { key: 'has_bpm', label: 'Has BPM', active: false },
  { key: 'has_key', label: 'Has Key', active: false },
  { key: 'has_audio', label: 'Has Audio', active: false },
  { key: 'has_apple_music', label: 'Apple Music', active: false },
  { key: 'rated', label: 'Rated', active: false },
  { key: 'has_notes', label: 'Has Notes', active: false },
];

const genreFilters: FilterChip[] = [
  { key: 'cumbia', label: 'Cumbia', active: false },
  { key: 'salsa', label: 'Salsa', active: false },
  { key: 'funk', label: 'Funk', active: false },
  { key: 'soul', label: 'Soul', active: false },
  { key: 'disco', label: 'Disco', active: false },
  { key: 'jazz', label: 'Jazz', active: false },
  { key: 'latin', label: 'Latin', active: false },
  { key: 'electronic', label: 'Electronic', active: false },
];

export const NoneActive: Story = {
  name: 'None active',
  args: {
    chips: searchFilters,
    onToggle: () => {},
  },
};

export const SomeActive: Story = {
  name: 'Some active',
  args: {
    chips: searchFilters.map((c, i) => ({ ...c, active: i < 2 })),
    onToggle: () => {},
    onClearAll: () => {},
  },
};

export const AllActive: Story = {
  name: 'All active',
  args: {
    chips: searchFilters.map((c) => ({ ...c, active: true })),
    onToggle: () => {},
    onClearAll: () => {},
  },
};

export const ManyChips: Story = {
  name: 'Many chips (wraps)',
  args: {
    chips: genreFilters.map((c, i) => ({ ...c, active: i === 0 })),
    onToggle: () => {},
    onClearAll: () => {},
  },
};

export const Interactive: Story = {
  name: 'Interactive (toggle state)',
  render: () => {
    const [chips, setChips] = useState(searchFilters);
    const toggle = (key: string) =>
      setChips((prev) =>
        prev.map((c) => (c.key === key ? { ...c, active: !c.active } : c))
      );
    const clearAll = () => setChips((prev) => prev.map((c) => ({ ...c, active: false })));
    return <FilterChips chips={chips} onToggle={toggle} onClearAll={clearAll} />;
  },
};

const controls = (
  <>
    <FilterGroup>
      <Button size="sm" variant="outline">Genre · 1</Button>
      <Button size="sm" variant="outline">Include similar</Button>
    </FilterGroup>
    <FilterGroup>
      <Button size="sm" variant="outline">Missing</Button>
      <Button size="sm" variant="outline">BPM / Key</Button>
    </FilterGroup>
  </>
);

export const GroupedControlsWithChips: Story = {
  name: 'Grouped controls, active chips on their own line (desktop)',
  args: {
    leading: controls,
    chips: genreFilters.slice(0, 2).map((c) => ({ ...c, active: true })),
    onToggle: () => {},
    onClearAll: () => {},
  },
};

export const GroupedControlsNoChips: Story = {
  name: 'Grouped controls, no filters (chip line holds its height)',
  args: { leading: controls, chips: [], onToggle: () => {} },
};

export const WithResultCount: Story = {
  name: 'Active chips, Clear all and result count (#794)',
  args: {
    chips: [
      { key: 'genre:latin', label: 'Latin', active: true },
      { key: 'bpm', label: 'BPM 110–130', active: true },
      { key: 'missingAudio', label: 'Missing audio', active: true },
    ],
    onToggle: () => {},
    onClearAll: () => {},
    summary: '81 results',
  },
};
