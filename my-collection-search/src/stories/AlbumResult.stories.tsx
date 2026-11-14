import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Flex, Text } from "@chakra-ui/react";
import AlbumResult from "@/components/AlbumResult";
import AlbumCardGrid from "@/components/AlbumCardGrid";
import { MetaTag } from "@/components/ui/RoleTags";
import { sampleAlbum, albumWithArtwork, albumMinimal } from "./fixtures/album";

const meta: Meta<typeof AlbumResult> = {
  title: "Components/AlbumResult",
  component: AlbumResult,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box maxW="800px" mx="auto">
        <Story />
      </Box>
    ),
  ],
  args: {
    album: sampleAlbum,
    showEditFields: false,
  },
};

export default meta;
type Story = StoryObj<typeof AlbumResult>;

export const Default: Story = {
  name: "Default (full view)",
};

export const WithHighResArtwork: Story = {
  name: "With high-res artwork",
  args: {
    album: albumWithArtwork,
  },
};

export const WithEditFields: Story = {
  name: "Full view with edit link",
  args: {
    showEditFields: true,
  },
};

export const MinimalData: Story = {
  name: "Minimal data (no artwork, no label)",
  args: {
    album: albumMinimal,
  },
};

export const MultipleInList: Story = {
  name: "Multiple albums (list view)",
  render: (args) => (
    <Box>
      <AlbumResult {...args} album={sampleAlbum} />
      <AlbumResult {...args} album={albumWithArtwork} />
      <AlbumResult {...args} album={albumMinimal} />
    </Box>
  ),
};

export const FullGrid: Story = {
  name: "Full cards in the album grid (every width)",
  render: (args) => (
    <AlbumCardGrid>
      <AlbumResult {...args} album={sampleAlbum} />
      <AlbumResult {...args} album={albumWithArtwork} />
      <AlbumResult {...args} album={albumMinimal} />
    </AlbumCardGrid>
  ),
};

export const FullWithMeta: Story = {
  name: "Full card with a caller's meta (artist page)",
  args: {
    meta: <MetaTag>Appears on · 2 tracks · B3, B4</MetaTag>,
  },
};

/** Compact tiles only live in horizontal scrollers. */
const Scroller = ({ children }: { children: React.ReactNode }) => (
  <Flex as="ul" listStyleType="none" gap="14px" overflowX="auto" p="0 6px 6px 0" m={0}>
    {React.Children.map(children, (child) => (
      <Box as="li" flex="0 0 140px" minW={0}>
        {child}
      </Box>
    ))}
  </Flex>
);

export const Compact: Story = {
  name: "Compact (horizontal scroller)",
  render: (args) => (
    <Scroller>
      <AlbumResult {...args} album={sampleAlbum} size="compact" />
      <AlbumResult {...args} album={albumWithArtwork} size="compact" />
      <AlbumResult {...args} album={albumMinimal} size="compact" />
    </Scroller>
  ),
};

export const CompactWithMeta: Story = {
  name: "Compact with custom meta (Home)",
  render: (args) => (
    <Scroller>
      <AlbumResult
        {...args}
        album={sampleAlbum}
        size="compact"
        meta={
          <Flex as="span" flex="1" align="center" justify="space-between" gap="4px" minW={0}>
            <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="semibold">
              6 PLAYS
            </Text>
            <MetaTag size="xs">★★★★☆</MetaTag>
          </Flex>
        }
      />
    </Scroller>
  ),
};

export const ResponsiveSize: Story = {
  name: "Responsive size (compact on phones, full from md)",
  render: (args) => (
    <AlbumCardGrid
      templateColumns={{ base: "repeat(3, 140px)", md: "repeat(2, minmax(0, 1fr))" }}
      columnGap={{ base: "14px", md: 5 }}
      overflowX={{ base: "auto", md: "visible" }}
    >
      {[sampleAlbum, albumWithArtwork, albumMinimal].map((album) => (
        <AlbumResult
          key={album.release_id}
          {...args}
          album={album}
          size={{ base: "compact", md: "full" }}
        />
      ))}
    </AlbumCardGrid>
  ),
};
