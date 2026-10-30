import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Button, Text } from "@chakra-ui/react";
import RetroDialog from "@/components/ui/RetroDialog";
import NamePlaylistDialog from "@/components/NamePlaylistDialog";
import PlaylistSelectionDialog from "@/components/PlaylistSelectionDialog";
import TrackEditForm from "@/components/TrackEditForm";
import ManifestVerificationDialog from "@/components/settings/dialogs/ManifestVerificationDialog";
import RemovedReleasesDialog from "@/components/settings/dialogs/RemovedReleasesDialog";

const meta: Meta = {
  title: "Components/Dialog layouts",
  parameters: { layout: "fullscreen", nextjs: { appDirectory: false } },
};
export default meta;
type Story = StoryObj;
const noop = () => {};

export const PlaylistName: Story = {
  render: function PlaylistNameStory() {
    const [open, setOpen] = React.useState(true);
    const [name, setName] = React.useState("Late night selections");
    return (
      <>
        <Button onClick={() => setOpen(true)}>Name playlist</Button>
        <NamePlaylistDialog
          open={open}
          name={name}
          setName={setName}
          trackCount={24}
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </>
    );
  },
};

export const TrackEditor: Story = {
  render: function TrackEditorStory() {
    const [open, setOpen] = React.useState(true);
    const closeRef = React.useRef<HTMLButtonElement>(null);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Edit track</Button>
        <TrackEditForm
          dialogOpen={open}
          setDialogOpen={setOpen}
          initialFocusRef={closeRef}
          onSave={() => setOpen(false)}
          track={{
            track_id: "preview",
            friend_id: 1,
            title: "Cumbia del Sol",
            artist: "Los Mirlos",
            bpm: 112,
            key: "D minor",
            local_tags: "Warm-up set",
            notes: "Check the long form and pinned actions on a phone.",
          }}
        />
      </>
    );
  },
};

export const WideData: Story = {
  render: function WideDataStory() {
    const [open, setOpen] = React.useState(true);
    return (
      <>
        <Button onClick={() => setOpen(true)}>View raw file</Button>
        <RetroDialog
          open={open}
          onOpenChange={setOpen}
          title="Discogs raw release file"
          maxW="980px"
          footer={
            <Box p={4}>
              <Button minH="44px" onClick={() => setOpen(false)}>
                Close
              </Button>
            </Box>
          }
        >
          <Box p={4}>
            <Text mb={3}>Release metadata</Text>
            <Box as="pre" overflowX="auto">
              {JSON.stringify(
                {
                  id: 12345,
                  title: "Late night selections",
                  artists: ["Los Mirlos"],
                  tracklist: Array.from({ length: 20 }, (_, i) => ({
                    position: `A${i + 1}`,
                    title: `Track ${i + 1}`,
                  })),
                },
                null,
                2,
              )}
            </Box>
          </Box>
        </RetroDialog>
      </>
    );
  },
};

export const ManifestReview: Story = {
  render: () => (
    <ManifestVerificationDialog
      open
      onOpenChange={noop}
      results={[
        {
          username: "DJ library",
          totalReleaseIds: 2,
          validFiles: [],
          missingFiles: ["1234", "5678"],
        },
      ]}
      onCleanup={noop}
      onContinue={noop}
      cleanupPending={false}
    />
  ),
};

export const RemovedReleases: Story = {
  render: () => (
    <RemovedReleasesDialog
      open
      onOpenChange={noop}
      username="DJ library"
      removedIds={["1234", "5678"]}
      onDelete={noop}
      onSkip={noop}
      deletePending={false}
    />
  ),
};

export const PlaylistSearch: Story = {
  render: () => (
    <PlaylistSelectionDialog open onClose={noop} onPlaylistSelect={noop} onCreateNew={noop} />
  ),
};
