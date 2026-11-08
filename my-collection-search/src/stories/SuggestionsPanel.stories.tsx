import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import type { Track } from "@/types/track";
import { sampleTrack } from "./fixtures/track";

const playlistTrack = (id: string, title: string, bpm: string, key: string): Track => ({
  ...sampleTrack,
  track_id: id,
  title,
  bpm,
  key,
  release_id: id,
});
const playlist = [
  playlistTrack("p-1", "Cumbia 73", "100", "G major"),
  playlistTrack("p-2", "Sonido Amazonico", "102", "D major"),
];
const rec = (
  id: string,
  title: string,
  album: string,
  score: number,
  extra: Partial<Track> = {},
) => ({
  ...sampleTrack,
  track_id: id,
  title,
  album,
  release_id: `${id}-r`,
  bpm: "104",
  key: "D major",
  _score: score,
  _simAudio: score,
  _simIdentity: null,
  ...extra,
});
const recommendations = [
  rec("s-1", "Cumbia Sonidera", "Cumbia Beat Vol. 1", 0.92),
  rec("s-2", "Mi Morena", "Cumbia Beat Vol. 1", 0.9),
  rec("s-3", "La Danza Del Petrolero", "Peru Bravo", 0.88, { key: "E minor", bpm: "98" }),
  rec("s-4", "Onda Cumbia", "Chicha Libre", 0.85, { local_audio_url: undefined }),
  rec("s-5", "Sacsayhuaman", "Cumbia Beat Vol. 1", 0.8),
];

/** Answers every recommendations query with the fixture, whatever its seeds or scope. */
function SeededRecommendations({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => {
    const seeded = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    seeded.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey;
      if (event.type === "added" && key[0] === "recommendations")
        seeded.setQueryData(key, recommendations);
    });
    return seeded;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Panel() {
  const [list, setList] = React.useState(playlist);
  const [seed, setSeed] = React.useState<{ track_id: string; friend_id: number } | null>({
    track_id: "p-1",
    friend_id: 6,
  });
  return (
    <SuggestionsPanel
      playlist={list}
      seed={seed}
      onSeedChange={setSeed}
      onAdd={(track, index) => setList((l) => [...l.slice(0, index), track, ...l.slice(index)])}
      onClose={() => {}}
    />
  );
}

const meta: Meta<typeof SuggestionsPanel> = {
  title: "Components/SuggestionsPanel",
  component: SuggestionsPanel,
  decorators: [
    (Story) => (
      <SeededRecommendations>
        <Box maxW="460px">
          <Story />
        </Box>
      </SeededRecommendations>
    ),
  ],
  render: () => <Panel />,
};
export default meta;
type Story = StoryObj<typeof SuggestionsPanel>;

/** Docked beside the playlist (xl and up); below xl it opens as the phone sheet. */
export const Default: Story = {};
