import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box } from "@chakra-ui/react";
import SuggestionRow, { SuggestionFoldRow, SuggestionList } from "@/components/SuggestionRow";
import { layoutSuggestions, rankSuggestions } from "@/lib/rankSuggestions";
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
      <Box maxW="390px">
        <SuggestionList>
          <Story />
        </SuggestionList>
      </Box>
    ),
  ],
  args: { seed, track: candidate },
};
export default meta;
type Story = StoryObj<typeof SuggestionRow>;

/** The playlist panel: "+" inserts after the seed, with the kebab beside it. */
export const PlaylistPanel: Story = { args: { onAdd: () => {}, menu: true } };
export const PlaylistPanelAdded: Story = { args: { onAdd: () => {}, menu: true, added: true } };
/** The track page: no playlist in context, so only the standard kebab. */
export const TrackPage: Story = { args: { menu: true } };
export const TrackPageAdded: Story = { args: { menu: true, added: true } };
export const NoAudio: Story = {
  args: { menu: true, track: { ...candidate, local_audio_url: undefined } },
};
export const KeyClash: Story = {
  args: { menu: true, track: { ...candidate, key: "F# minor" } },
};
export const NoKey: Story = {
  args: {
    menu: true,
    track: { ...trackMinimal, key: null, bpm: null, _simAudio: null, _simIdentity: null },
  },
};
export const Compact: Story = { args: { onAdd: () => {}, menu: true, compact: true } };
export const Fold: Story = {
  render: () => <SuggestionFoldRow count={3} source="Another Album" onExpand={() => {}} />,
};

const sibling = (id: string, title: string, album: string, score: number) => ({
  ...candidate,
  track_id: id,
  title,
  album,
  release_id: id,
  _simAudio: score,
});
const pool = [
  sibling(
    "l-1",
    "Cumbia Sonidera",
    "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds)",
    0.9,
  ),
  sibling("l-2", "La Danza Del Petrolero", "Peru Bravo", 0.85),
  sibling(
    "l-3",
    "Mi Morena",
    "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds)",
    0.8,
  ),
  sibling(
    "l-4",
    "Sacsayhuaman",
    "Cumbia Beat Vol. 1 (Experimental Guitar-Driven Tropical Sounds)",
    0.75,
  ),
  sibling("l-5", "Onda Cumbia", "Chicha Libre", 0.7),
];

/** The track page list: one block, each release's fold under its row, expanding in place. */
export const ListWithInlineFolds: Story = {
  render: function ListStory() {
    const [expanded, setExpanded] = useState<string[]>([]);
    const ranked = rankSuggestions(pool, { seed });
    const { items } = layoutSuggestions(ranked, { expanded, limit: 20 });
    return (
      <>
        {items.map((item) =>
          item.kind === "fold" ? (
            <SuggestionFoldRow
              key={item.fold.key}
              count={item.fold.tracks.length}
              source={item.fold.release}
              onExpand={() => setExpanded((keys) => [...keys, item.fold.key])}
            />
          ) : (
            <SuggestionRow key={item.track.track_id} seed={seed} track={item.track} menu />
          ),
        )}
      </>
    );
  },
};
