import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HStack } from "@chakra-ui/react";
import AlbumActionsMenu from "@/components/AlbumActionsMenu";

const noop = () => {};

const meta: Meta<typeof AlbumActionsMenu> = {
  title: "Components/AlbumActionsMenu",
  component: AlbumActionsMenu,
  parameters: { layout: "centered" },
  args: {
    albumTitle: "Cumbia Cumbia Cumbia!!! Vol. 3",
    albumArtist: "Various Artists",
    catalogue: "Album · Vinyl · LP-349",
    subtitle: "Various Artists · Sony Music · 2024",
    onLogCare: noop,
    onEnrichAlbum: noop,
    onChangeArtwork: noop,
    onDeleteAlbum: noop,
    onPlayAlbum: noop,
    onDownloadMissing: noop,
    discogsUrl: "https://www.discogs.com/release/12345",
    onViewRawDiscogs: noop,
    editAlbumHref: "/albums/12345/edit",
  },
};

export default meta;
type Story = StoryObj<typeof AlbumActionsMenu>;

export const Default: Story = {
  name: "Default (all actions)",
};

export const Downloading: Story = {
  name: "Downloading in progress",
  args: { isDownloading: true },
};

export const NoPlayback: Story = {
  name: "No playback (no audio found)",
  args: {
    onPlayAlbum: undefined,
    onDownloadMissing: undefined,
  },
};

export const NoDiscogs: Story = {
  name: "No Discogs links",
  args: {
    discogsUrl: undefined,
    onViewRawDiscogs: undefined,
  },
};

export const EditOnly: Story = {
  name: "Edit only (no playback, no Discogs)",
  args: {
    onPlayAlbum: undefined,
    onDownloadMissing: undefined,
    discogsUrl: undefined,
    onViewRawDiscogs: undefined,
  },
};

export const MobileAndDesktop: Story = {
  name: "Mobile + Desktop side by side",
  render: (args) => (
    <HStack gap={8} align="start">
      <AlbumActionsMenu {...args} />
    </HStack>
  ),
};
