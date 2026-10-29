import { useEffect, useMemo, useState } from "react";
import { TrackLookup, type GroovenetClient } from "@groovenet/client";
import type { PlaybackSnapshot } from "@groovenet/player";

/** Server queue entries contain refs/title/artist only. Hydrate presentation without editing playback state. */
export function useQueueMetadata(
  api: GroovenetClient,
  snapshot: PlaybackSnapshot,
  remote: boolean,
): PlaybackSnapshot {
  const lookup = useMemo(() => new TrackLookup((refs) => api.batchGetTracks(refs)), [api]);
  const [version, setVersion] = useState(0);
  // Position events recreate the queue; only a change of collection identities needs another load.
  const refs = JSON.stringify(snapshot.queue.map(({ track }) => [track.track_id, track.friend_id]));
  useEffect(() => {
    if (!remote) return;
    let active = true;
    const identities = (JSON.parse(refs) as Array<[string, number]>).map(
      ([track_id, friend_id]) => ({ track_id, friend_id }),
    );
    void lookup
      .load(identities)
      .then(() => {
        if (active) setVersion((value) => value + 1);
      })
      .catch(() => {
        // Keep the server's title/artist when collection metadata is unavailable.
      });
    return () => {
      active = false;
    };
  }, [lookup, refs, remote]);

  return useMemo(() => {
    if (!remote) return snapshot;
    const queue = snapshot.queue.map((entry) => {
      const metadata = lookup.get(entry.track);
      return { ...entry, track: metadata ? { ...metadata, ...entry.track } : entry.track };
    });
    return {
      ...snapshot,
      queue,
      current: queue.find((entry) => entry.id === snapshot.current?.id) ?? snapshot.current,
    };
  }, [snapshot, lookup, remote, version]);
}
