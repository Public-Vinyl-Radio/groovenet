import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import Cover from "@/components/Cover";
import { CoverMosaic } from "@/components/PlaylistListItem";

// Self-contained colour art so the token preview works offline as well.
const art = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e54c75"/><circle cx="100" cy="100" r="70" fill="#1d8794"/><circle cx="100" cy="100" r="25" fill="#f0cc50"/></svg>')}`;
const meta = { title: "Design/Cover", component: Cover } satisfies Meta<typeof Cover>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Both token values side by side. Hover or tab to reveal colour; playing and inspect stay colour. */
export const Treatments: Story = {
  render: () => (
    <Stack gap={8}>
      {["0", "6px"].flatMap((radius) =>
        [0, 1].map((monochrome) => (
          <Stack
            key={`${radius}-${monochrome}`}
            gap={3}
            css={{ "--gn-radius": radius, "--gn-cover-grayscale": monochrome }}
          >
            <Text>
              Radius {radius} · Monochrome {monochrome ? "on" : "off"}
            </Text>
            <Flex gap={5} wrap="wrap" align="start">
              <Cover src={art} alt="Default" size="96px" tabIndex={0} />
              <Box bg="fg" p={3}>
                <Cover src={art} alt="Inverse" size="96px" inverse />
              </Box>
              <Cover src={art} alt="Stacked" size="96px" stacked />
              <Cover src={art} alt="Shadow" size="96px" shadow />
              <Cover src={art} alt="Playing" size="96px" playing />
              <Cover src={art} alt="Inspect" size="96px" inspect />
              <Cover size="96px" />
              <Cover src="/missing-cover.jpg" size="96px" />
              <Cover src={art} size="96px">
                <Text position="absolute" bottom={0} bg="overlay.scrim" color="overlay.fg">
                  Overlay
                </Text>
              </Cover>
              <CoverMosaic urls={[art, art]} size="96px" />
            </Flex>
          </Stack>
        )),
      )}
    </Stack>
  ),
};
