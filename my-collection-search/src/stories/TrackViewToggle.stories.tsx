import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Flex, Grid } from "@chakra-ui/react";
import TrackResult, { TrackListHeader } from "@/components/TrackResult";
import TrackViewToggle from "@/components/TrackViewToggle";
import type { TrackViewMode } from "@/hooks/useTrackViewMode";
import { sampleTrack, trackWithAudio, trackMinimal } from "./fixtures/track";

const meta: Meta<typeof TrackViewToggle> = {
  title: "Components/TrackViewToggle",
  component: TrackViewToggle,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TrackViewToggle>;

const tracks = [sampleTrack, trackWithAudio, trackMinimal];

/** The Related tracks shape: the toggle above a list that is one outlined block in Rows view. */
export const RelatedTracksList: Story = {
  name: "Related tracks (rows / cards)",
  render: () => {
    const [mode, setMode] = useState<TrackViewMode>("row");
    return (
      <Box maxW="1360px" mx="auto">
        <Flex justify="flex-end" gap={1} mb={3}>
          <TrackViewToggle value={mode} onChange={setMode} />
        </Flex>
        {mode === "row" ? (
          <Box
            borderWidth="outline"
            borderColor="border.ink"
            boxShadow="md"
            css={{ containerType: "inline-size" }}
          >
            <TrackListHeader />
            {tracks.map((t) => (
              <TrackResult key={t.track_id} track={t} layout="row" showUsername={false} />
            ))}
          </Box>
        ) : (
          <Grid templateColumns="1fr" columnGap={3}>
            {tracks.map((t) => (
              <TrackResult key={t.track_id} track={t} layout="card" showUsername={false} />
            ))}
          </Grid>
        )}
      </Box>
    );
  },
};
