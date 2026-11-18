"use client";

import { Box } from "@chakra-ui/react";
import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import RetroDialog from "@/components/ui/RetroDialog";
import TrackLyricsPanel from "@/components/track-detail/TrackLyricsPanel";

type Props = {
  trackId: string;
  friendId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The lyrics panel in a dialog, opened from the track page's ⋯ menu (#1214) and
 * wired to the owner-only lyrics endpoint (#1171). Full screen on phones.
 */
export default function TrackLyricsDialog({ trackId, friendId, open, onOpenChange }: Props) {
  const { query, save, clear } = useTrackLyrics(trackId, friendId);
  return (
    <RetroDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lyrics"
      maxW="2xl"
      fullScreenOnMobile
      dismissible={!save.isPending && !clear.isPending}
    >
      <Box p={4}>
        <TrackLyricsPanel
          state={query.data}
          error={query.error}
          saving={save.isPending}
          clearing={clear.isPending}
          onSave={(text) => save.mutateAsync(text)}
          onClear={() => clear.mutateAsync()}
        />
      </Box>
    </RetroDialog>
  );
}
