import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import FilterChips, { type FilterChip } from '@/components/FilterChips';

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
