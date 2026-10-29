import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import AlbumResult from "@/components/AlbumResult";
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
