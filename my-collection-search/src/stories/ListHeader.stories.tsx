import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { LuListChecks, LuPlus } from 'react-icons/lu';
import PageHeader from '@/components/layout/PageHeader';
import FilterChips, { type FilterChip } from '@/components/FilterChips';
import {
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from '@/components/layout/ListHeader';
import type { TrackViewMode } from '@/hooks/useTrackViewMode';
import type { TrackSearchMode } from '@/api-contract/schemas';
import SearchModeMenu from '@/components/search/SearchModeMenu';
import FiltersPanel from '@/components/FiltersPanel';
import { TrackFilterSections, showResultsLabel } from '@/components/TrackSearchOptionsModal';
import { createEmptyFilters, type TracksFilter } from '@/lib/trackFilters';
import AlbumSortMenu, { DEFAULT_ALBUM_SORT } from '@/components/AlbumSortMenu';
import { AlbumOptionsMenu } from '@/components/AlbumSearchMenu';
import { AlbumFilterSections, showAlbumsLabel } from '@/components/AlbumFiltersModal';

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
  const [mode, setMode] = useState<TrackSearchMode>('semantic');
  const [panelOpen, setPanelOpen] = useState(false);
  const [missing, setMissing] = useState<TracksFilter>(createEmptyFilters());
  const [sort, setSort] = useState<string>(DEFAULT_ALBUM_SORT);
  const [albumMissing, setAlbumMissing] = useState<Record<string, boolean>>({});
  return (
    <Box maxW="1160px">
      <PageHeader
        title={title}
        desktopActions={
          <>
            {primary && <AlbumOptionsMenu onOpenArtwork={() => {}} />}
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
        field={
          <SearchField
            value={query}
            onChange={setQuery}
            label={`Search ${title.toLowerCase()}`}
            placeholder={`Search ${title.toLowerCase()}`}
            endElement={primary ? undefined : <SearchModeMenu value={mode} onChange={setMode} />}
          />
        }
        controls={
          primary ? (
            <>
              <AlbumSortMenu value={sort} onChange={setSort} trigger="button" />
              <FiltersPanel
                open={panelOpen}
                onOpenChange={setPanelOpen}
                scope="Albums"
                activeCount={chips.length}
                onReset={() => setChips([])}
                showLabel={showAlbumsLabel(81)}
              >
                <AlbumFilterSections
                  genres={[]}
                  onAddGenre={() => {}}
                  onRemoveGenre={() => {}}
                  includeSimilar={false}
                  onIncludeSimilarChange={() => {}}
                  missing={albumMissing}
                  onToggleMissing={(key) => setAlbumMissing((prev) => ({ ...prev, [key]: !prev[key] }))}
                  activeCount={chips.length}
                  resultCount={81}
                  onReset={() => setChips([])}
                />
              </FiltersPanel>
            </>
          ) : (
            <FiltersPanel
              open={panelOpen}
              onOpenChange={setPanelOpen}
              scope="Tracks"
              activeCount={chips.length}
              onReset={() => setChips([])}
              showLabel={showResultsLabel(81)}
            >
              <TrackFilterSections
                first
                genres={[]}
                onAddGenre={() => {}}
                onRemoveGenre={() => {}}
                includeSimilar={false}
                onIncludeSimilarChange={() => {}}
                attributes={{}}
                onAttributesChange={() => {}}
                missing={missing}
                onToggleMissing={(key) => setMissing((prev) => ({ ...prev, [key]: !prev[key] }))}
                activeCount={chips.length}
                resultCount={81}
                onReset={() => setChips([])}
              />
            </FiltersPanel>
          )
        }
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
