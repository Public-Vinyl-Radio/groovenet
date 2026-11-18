import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import { fn } from "storybook/test";
import TrackLyricsPanel from "@/components/track-detail/TrackLyricsPanel";
import type { TrackLyrics, TrackLyricsState } from "@/services/internalApi/trackLyrics";

const lyrics: TrackLyrics = {
  text: [
    "Under the lights we move as one",
    "Needle down, the night's begun",
    "",
    "Hold the groove, don't let it go",
    "Side B spinning soft and slow",
  ].join("\n"),
  source: "embedded",
  updated_at: "2026-11-11T10:00:00.000Z",
};
const fromFile: TrackLyricsState = { kind: "lyrics", lyrics };

const meta: Meta<typeof TrackLyricsPanel> = {
  title: "Track detail/Lyrics panel",
  component: TrackLyricsPanel,
  args: {
    state: fromFile,
    onSave: fn(async () => undefined),
    onClear: fn(async () => undefined),
  },
  decorators: [
    (Story) => (
      <Box maxW="720px" p={4}>
        <Story />
      </Box>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TrackLyricsPanel>;

/** The Lyrics dialog's body: the words, saying where they came from. */
export const Lyrics: Story = {};

export const EditedByYou: Story = {
  args: {
    state: { kind: "lyrics", lyrics: { ...lyrics, source: "user" } },
  },
};

/** An instrumental, or a file without lyrics. */
export const Empty: Story = { args: { state: { kind: "none" } } };

export const Editing: Story = { args: { defaultEditing: true } };

export const AddingToEmpty: Story = { args: { state: { kind: "none" }, defaultEditing: true } };

export const Saving: Story = { args: { defaultEditing: true, saving: true } };

export const Loading: Story = { args: { state: undefined } };

export const LoadFailed: Story = {
  args: { state: undefined, error: new Error("Failed to read lyrics") },
};
