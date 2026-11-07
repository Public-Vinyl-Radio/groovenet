import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Flex } from "@chakra-ui/react";
import Cover from "@/components/Cover";
import TrackIdentity, { TrackCoverLink } from "@/components/TrackIdentity";
import { sampleTrack } from "./fixtures/track";

const track = { ...sampleTrack, release_id: "33416876", friend_id: 1 };

const meta: Meta<typeof TrackIdentity> = {
  title: "Components/TrackIdentity",
  component: TrackIdentity,
  decorators: [
    (Story) => (
      <Box maxW="360px">
        <Flex gap="10px" align="center">
          <Story />
        </Flex>
      </Box>
    ),
  ],
  args: { track, links: "all" },
};
export default meta;
type Story = StoryObj<typeof TrackIdentity>;

/** Title → track page, artist → albums search, album → album page. */
export const AllIds: Story = {};

/** No release id: the album is plain text, as AlbumLink already does. */
export const MissingReleaseId: Story = { args: { track: { ...track, release_id: undefined } } };

/** No friend id: hrefs drop `?friend_id=`. */
export const MissingFriendId: Story = { args: { track: { ...track, friend_id: undefined } } };

/** Long names end in an ellipsis; the full text is in the `title` tooltip. */
export const LongNames: Story = {
  args: {
    track: {
      ...track,
      title: "Cumbia Sonidera de los Barrios del Sur con Introducción Extendida (Version Larga)",
      artist: "Los Demonios Del Mantaro y Su Conjunto Tropical",
      album: "Cumbia Cumbia Cumbia!!! Volume Three: The Complete Sessions",
    },
  },
};

/** Dense phone rows: only the title links. */
export const TitleOnly: Story = { args: { links: "title" } };

/** A row that is itself the target. */
export const PlainText: Story = { args: { links: "none" } };

/** With a cover: a hidden, untabbable second route to the album. */
export const WithCover: Story = {
  decorators: [
    (Story) => (
      <Flex gap="10px" align="center">
        <TrackCoverLink track={track}>
          <Cover src={track.album_thumbnail} alt="" size="48px" />
        </TrackCoverLink>
        <Story />
      </Flex>
    ),
  ],
};
