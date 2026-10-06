import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Box, Flex, Text } from '@chakra-ui/react';
import GenreBadge, { GenreBadgeList } from '@/components/GenreBadge';

const meta: Meta<typeof GenreBadge> = {
  title: 'Components/GenreBadge',
  component: GenreBadge,
  parameters: { layout: 'padded' },
  args: {
    item: { label: 'Cumbia', slug: 'cumbia' },
    kind: 'track',
    scope: 'tracks',
    size: 'sm',
  },
};

export default meta;
type Story = StoryObj<typeof GenreBadge>;

/** A track genre in the taxonomy: links to `/?genre=cumbia`. */
export const LinkedTrackGenre: Story = {};

/** An unreconciled `local_tags` value: plain text, drawn subtle. */
export const UnreconciledTrackGenre: Story = {
  args: { item: { label: 'Psychedelic Cumbia', slug: null } },
};

export const DiscogsGenre: Story = {
  args: { item: { label: 'Latin', slug: 'latin' }, kind: 'discogs-genre', scope: 'albums' },
};

export const DiscogsStyle: Story = {
  args: { item: { label: 'Bossa Nova', slug: 'bossa-nova' }, kind: 'discogs-style', scope: 'albums' },
};

/** A Discogs value the taxonomy has no name or alias for. */
export const UnmappedDiscogsStyle: Story = {
  args: { item: { label: 'Unmapped Style', slug: null }, kind: 'discogs-style', scope: 'albums' },
};

/** Tab onto a badge to see the focus ring. */
export const KeyboardFocus: Story = {
  render: (args) => (
    <Flex gap={2}>
      <GenreBadge {...args} />
      <GenreBadge {...args} item={{ label: 'Chicha', slug: 'chicha' }} />
    </Flex>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('a')?.focus();
  },
};

/** Every state in one row, at the compact size track cards use. */
export const MixedRowCompact: Story = {
  render: () => (
    <Flex gap={1.5} flexWrap="wrap">
      <GenreBadgeList
        kind="discogs-genre"
        scope="tracks"
        size="xs"
        items={[{ label: 'Latin', slug: 'latin' }]}
      />
      <GenreBadgeList
        kind="discogs-style"
        scope="tracks"
        size="xs"
        items={[
          { label: 'Cumbia', slug: 'cumbia' },
          { label: 'Unmapped Style', slug: null },
        ]}
      />
      <GenreBadgeList
        kind="track"
        scope="tracks"
        size="xs"
        colorPalette="blue"
        items={[
          { label: 'Psychedelic Cumbia', slug: 'psychedelic-cumbia' },
          { label: 'Feminist Anthem', slug: null },
        ]}
      />
    </Flex>
  ),
};

/** Inside a clickable row: clicking a badge follows the link, not the row. */
export const InsideClickableRow: Story = {
  render: (args) => (
    <Box
      borderWidth="1px"
      borderRadius="md"
      p={3}
      cursor="pointer"
      _hover={{ bg: 'bg.muted' }}
      onClick={() => console.log('row clicked')}
    >
      <Text fontWeight="medium" mb={1}>
        La Danza de los Mirlos
      </Text>
      <GenreBadge {...args} />
    </Box>
  ),
};
