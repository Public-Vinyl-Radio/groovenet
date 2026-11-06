import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import SuggestionRow, { SuggestionFoldRow } from "@/components/SuggestionRow";
import { sampleTrack, trackMinimal } from "./fixtures/track";

const seed = { ...sampleTrack, key: "G major", bpm: "100" };
const candidate = {
  ...sampleTrack,
  track_id: "x-1",
  title: "Cumbia Sonidera",
  album: "Another Album",
  release_id: "999",
  key: "D major",
  bpm: "104",
  _simAudio: 0.8,
  _simIdentity: null,
};

const meta: Meta<typeof SuggestionRow> = {
  title: "Components/SuggestionRow",
  component: SuggestionRow,
  decorators: [
    (Story) => (
      <Box as="ul" m={0} p={0} maxW="390px">
        <Story />
      </Box>
    ),
  ],
  args: { seed, track: candidate, onAdd: () => {}, onPreview: () => {} },
};
export default meta;
type Story = StoryObj<typeof SuggestionRow>;

export const Default: Story = {};
export const Added: Story = { args: { added: true } };
export const KeyClash: Story = { args: { track: { ...candidate, key: "F# minor" } } };
export const NoKey: Story = {
  args: { track: { ...trackMinimal, key: null, bpm: null, _simAudio: null, _simIdentity: null } },
};
export const Fold: Story = {
  render: () => <SuggestionFoldRow count={3} source="Another Album" onExpand={() => {}} />,
};
