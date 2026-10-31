import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import { SpinDetailEmpty, SpinDetailModal, SpinDetailPanel } from "@/components/spins/SpinDetail";
import { findSpinSelection } from "@/components/spins/spinSelection";
import { groupListeningLog, type SpinListItem } from "@/components/spins/spinSummary";
import { queryKeys } from "@/lib/queryKeys";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { EVENING } from "./fixtures/listeningLog";

const ZONE = "America/Los_Angeles";

function withSession(item: SpinListItem, session: Partial<SpinListItem["session"]>) {
  return { ...item, session: { ...item.session, ...session } };
}

const [digital, innerspeaker, cumbia] = EVENING;
const manual = withSession(innerspeaker, { provenance: "manual", selection_mode: "tracks" });
const playlist = withSession(innerspeaker, { provenance: "playlist", selection_mode: "playlist" });

/** The selection of `item`'s track at `ordinal`, inside the evening's session. */
function selectionOf(item: SpinListItem, ordinal: number) {
  const items = EVENING.map((spin) => (spin.session.id === item.session.id ? item : spin));
  const days = groupListeningLog(items, ZONE, new Date("2026-10-28T12:00:00Z"));
  return findSpinSelection(days, `${item.session.id}:${ordinal}`)!;
}

// Seed what the detail fetches, so the stories need no network.
function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  for (const item of EVENING) {
    client.setQueryData(["album", item.session.release_id, item.session.friend_id], {
      album: {
        release_id: item.session.release_id,
        friend_id: item.session.friend_id,
        title: item.album?.title ?? "",
        artist: item.album?.artist ?? "",
        library_identifier: `LP-${item.session.id}`,
      },
      tracks: [],
    });
    for (const event of item.track_events) {
      client.setQueryData(
        queryKeys.spinTrackStats({ friend_id: event.friend_id, track_id: event.track_id }),
        { play_count: 4, last_played_at: event.played_at },
      );
    }
  }
  return client;
}

const handlers = { onSelect: () => {}, onClose: () => {}, onDeleted: () => {} };

const meta: Meta<typeof SpinDetailPanel> = {
  title: "Spins/SpinDetail",
  component: SpinDetailPanel,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <QueryClientProvider client={seededClient()}>
        <DisplayTimeZoneProvider timeZone={ZONE}>
          <Box maxW="380px" pr="6px" pb="6px">
            <Story />
          </Box>
        </DisplayTimeZoneProvider>
      </QueryClientProvider>
    ),
  ],
  args: { ...handlers, selection: selectionOf(innerspeaker, 2) },
};

export default meta;
type Story = StoryObj<typeof SpinDetailPanel>;

export const VinylAuto: Story = { name: "Vinyl, auto-detected" };

export const VinylManual: Story = {
  name: "Vinyl, manual entry",
  args: { selection: selectionOf(manual, 1) },
};

export const Playlist: Story = {
  name: "Vinyl, logged by a playlist",
  args: { selection: selectionOf(playlist, 0) },
};

export const Digital: Story = {
  name: "Digital (last of the session)",
  args: { selection: selectionOf(digital, 0) },
};

export const FirstOfSession: Story = {
  name: "First spin of the session, no art",
  args: { selection: selectionOf(cumbia, 0) },
};

export const Empty: Story = { render: () => <SpinDetailEmpty /> };

export const PhoneModal: Story = {
  name: "Phone modal",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: (args) => <SpinDetailModal {...args} />,
};
