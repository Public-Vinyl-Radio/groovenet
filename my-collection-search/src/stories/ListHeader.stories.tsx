import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { LuListChecks, LuPlus } from 'react-icons/lu';
import PageHeader from '@/components/layout/PageHeader';
import FilterChips, { type FilterChip } from '@/components/FilterChips';
import {
  FiltersButton,
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from '@/components/layout/ListHeader';
import type { TrackViewMode } from '@/hooks/useTrackViewMode';

/**
 * The desktop list header (#794): the page row, the search row and the chip
 * row, every control outlined with a mono label. View at 1280–1440px.
 */
const meta: Meta = {
  title: 'App/List header',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

const initialChips: FilterChip[] = [
  { key: 'genre:latin', label: 'Latin', active: true },
  { key: 'bpm', label: 'BPM 110–130', active: true },
  { key: 'missingAudio', label: 'Missing audio', active: true },
];

function Header({ title, primary }: { title: string; primary?: boolean }) {
  const [view, setView] = useState<TrackViewMode>('card');
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState(initialChips);
  return (
    <Box maxW="1160px">
      <PageHeader
        title={title}
        desktopActions={
          <>
            {!primary && (
              <HeaderButton quiet>
                <LuListChecks aria-hidden="true" /> Select
              </HeaderButton>
            )}
            <ViewModeSwitch value={view} onChange={setView} />
            {primary && (
              <HeaderButton variant="solid">
                <LuPlus aria-hidden="true" /> Add album
              </HeaderButton>
            )}
          </>
        }
      />
      <ListSearchRow
        maxW={primary ? '640px' : '760px'}
        field={<SearchField value={query} onChange={setQuery} label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}`} />}
        controls={<FiltersButton activeCount={chips.length} />}
      />
      <FilterChips
        chips={chips}
        onToggle={(key) => setChips((prev) => prev.filter((c) => c.key !== key))}
        onClearAll={() => setChips([])}
        summary={chips.length > 0 ? '81 results' : '4,044 results'}
      />
    </Box>
  );
}

export const Tracks: Story = { render: () => <Header title="Tracks" /> };

export const Albums: Story = { render: () => <Header title="Albums" primary /> };
