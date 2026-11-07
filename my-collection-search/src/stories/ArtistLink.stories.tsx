import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Stack, Text } from "@chakra-ui/react";
import ArtistLink from "@/components/ArtistLink";
import type { ArtistCreditRef } from "@/api-contract/schemas";

const credit = (
  id: number,
  name: string,
  position: number,
  extra: Partial<ArtistCreditRef> = {},
): ArtistCreditRef => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\W+/g, "-"),
  is_placeholder: false,
  role: "primary",
  position,
  credited_as: name,
  ...extra,
});

const meta: Meta<typeof ArtistLink> = {
  title: "Components/ArtistLink",
  component: ArtistLink,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof ArtistLink>;

/** Every credit shape (#708). Tab through: each link takes a visible focus ring. */
export const Credits: Story = {
  render: () => (
    <Stack gap="3">
      <ArtistLink artist="Mac DeMarco" credits={[credit(1, "Mac DeMarco", 0)]} />
      <ArtistLink
        artist="Mexican Institute of Sound & Meridian Brothers"
        credits={[
          credit(2, "Mexican Institute of Sound", 0),
          credit(3, "Meridian Brothers", 1, { role: "featured" }),
        ]}
      />
      <ArtistLink artist="Various" credits={[credit(4, "Various", 0, { is_placeholder: true })]} />
      <ArtistLink artist="Not reconciled yet" credits={[]} />
      <ArtistLink artist="Credits not loaded (album search)" />
    </Stack>
  ),
};

/** A narrow row: links truncate with the row, never clip mid-glyph. */
export const InNarrowRow: Story = {
  render: () => (
    <Box w="180px" overflow="hidden">
      <Text truncate fontSize="13px" color="fg.muted">
        <ArtistLink
          artist="Mexican Institute of Sound & Meridian Brothers"
          credits={[credit(2, "Mexican Institute of Sound", 0), credit(3, "Meridian Brothers", 1)]}
        />
      </Text>
    </Box>
  ),
};
