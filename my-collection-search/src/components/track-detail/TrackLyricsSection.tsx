"use client";

import { useTrackLyrics } from "@/hooks/useTrackLyrics";
import TrackLyricsPanel from "@/components/track-detail/TrackLyricsPanel";

type Props = { trackId: string; friendId: number };

/** The lyrics panel, wired to the owner-only lyrics endpoint (#1171). */
export default function TrackLyricsSection({ trackId, friendId }: Props) {
  const { query, save, clear } = useTrackLyrics(trackId, friendId);
  return (
    <TrackLyricsPanel
      state={query.data}
      error={query.error}
      saving={save.isPending}
      clearing={clear.isPending}
      onSave={(text) => save.mutateAsync(text)}
      onClear={() => clear.mutateAsync()}
    />
  );
}
