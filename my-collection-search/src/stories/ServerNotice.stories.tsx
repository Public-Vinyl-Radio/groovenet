import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Flex } from "@chakra-ui/react";
import { FiVolume2 } from "react-icons/fi";
import ServerNotice, { lostSpeakerNotice } from "@/components/player/ServerNotice";
import PlayerControlsView from "@/components/player/PlayerControlsView";
import { lostSpeakerPlayer } from "./fixtures/serverPlayer";
import { sampleTrack } from "./fixtures/track";

const noop = () => {};
const controls = { play: noop, choose: noop, disabled: false };

/** The server player's notice above its controls, as the docked player shows it (#1241). */
function LostSpeaker({ back }: { back: boolean }) {
  const notice = lostSpeakerNotice(lostSpeakerPlayer({ back }).state.error!, controls);
  return (
    <Flex direction="column" gap="12px">
      <ServerNotice notice={notice} />
      <PlayerControlsView
        showQueueButton
        isQueueOpen={false}
        compact={false}
        showVolumeControls
        isPlaying={false}
        currentTrack={sampleTrack}
        safeLen={2}
        canPrev={false}
        canNext
        playPrev={noop}
        playNext={noop}
        volume={0.3}
        setVolume={noop}
        VolumeIcon={FiVolume2}
        onPlay={noop}
        onPause={noop}
        onSeek={async () => {}}
      />
    </Flex>
  );
}

const meta: Meta<typeof LostSpeaker> = {
  title: "Components/ServerNotice/Lost speaker",
  component: LostSpeaker,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Box maxW="900px" mx="auto">
        <Story />
      </Box>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LostSpeaker>;

export const Lost: Story = { name: "Speaker went away", args: { back: false } };
export const Back: Story = { name: "Speaker is back", args: { back: true } };
