"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ServerPlayer } from "@groovenet/contracts";
import type { PlayerEdit } from "@groovenet/client/player-session";
import { useServerPlayerTime } from "@/components/player/usePlayerTime";
import { artworkOf } from "@/components/player/trackMeta";
import { toaster } from "@/components/ui/toaster";
import { useQueueDrawer } from "@/hooks/useQueueDrawer";
import { useServerQueueTracks, type LabelledTrackRef } from "@/hooks/useServerQueueTracks";
import { useRecentDetectionsQuery } from "@/hooks/useVinylPipelineQuery";
import { upcomingLocalTracks, useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { playerApi } from "@/services/internalApi/players";
import { usePlaybackTargetDialog } from "@/stores/playbackTargetDialogStore";
import { NowPlayingCard } from "./NowPlayingCard";
import { freshDetection, pickServerPlayer } from "./nowPlaying";

const noPlayers: ServerPlayer[] = [];
const LOCKED = "Unlock server access before trying this action again.";
// How often the vinyl fallback asks for the newest detection, and re-checks its age.
const DETECTION_POLL_MS = 15_000;

type UpdateOrder = {
  players: readonly ServerPlayer[];
  tick: number;
  seen: ReadonlyMap<string, { revision: number; at: number }>;
};

/**
 * The order this page saw players change in, as a counter per player: a
 * revision that moved takes the next tick, first sight counts as oldest (0).
 * Kept in state and adjusted while rendering, so a change ranks in the same render.
 */
function useUpdateOrder(players: readonly ServerPlayer[]): ReadonlyMap<string, number> {
  const [order, setOrder] = useState<UpdateOrder>({ players: noPlayers, tick: 0, seen: new Map() });
  let current = order;
  if (order.players !== players) {
    let tick = order.tick;
    const seen = new Map<string, { revision: number; at: number }>();
    for (const player of players) {
      const last = order.seen.get(player.id);
      const at = !last ? 0 : last.revision === player.revision ? last.at : ++tick;
      seen.set(player.id, { revision: player.revision, at });
    }
    current = { players, tick, seen };
    setOrder(current);
  }
  return useMemo(() => new Map([...current.seen].map(([id, { at }]) => [id, at])), [current.seen]);
}

function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

/**
 * Home's Now playing (#881). Server (OwnTone) players only, never this
 * browser's audio; with none playing, the newest vinyl detection while it is
 * fresh. Hidden when there is neither. Reads the players the
 * PlaybackTargetProvider already streams, so it opens no subscription of its own.
 */
export default function HomeNowPlaying() {
  const target = useOptionalPlaybackTarget();
  const local = usePlaylistPlayer();
  const drawer = useQueueDrawer();
  const openPicker = usePlaybackTargetDialog((s) => s.setOpen);
  const players = target?.players ?? noPlayers;
  const updatedAt = useUpdateOrder(players);
  const [sticky, setSticky] = useState<string | null>(null);
  const player = pickServerPlayer(players, updatedAt, sticky);
  const playerId = player?.id ?? null;
  useEffect(() => {
    if (playerId) setSticky(playerId);
  }, [playerId]);

  const detections = useRecentDetectionsQuery(
    { matched: true, limit: 1 },
    { enabled: !player, refetchInterval: DETECTION_POLL_MS },
  );
  const now = useNow(DETECTION_POLL_MS, !player);
  const detection = player ? null : freshDetection(detections.data?.detections ?? [], now);

  const state = player?.state ?? null;
  const entryIndex = state ? state.queue.findIndex((e) => e.id === state.current_entry_id) : -1;
  const entry = state && entryIndex >= 0 ? state.queue[entryIndex] : null;
  const ref: LabelledTrackRef | null =
    entry ??
    (detection
      ? {
          track_id: detection.track_id!,
          friend_id: detection.friend_id!,
          title: detection.title!,
          artist: detection.artist ?? "",
        }
      : null);
  const refKey = ref ? `${ref.track_id}:${ref.friend_id}:${ref.title}:${ref.artist}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ref's contents, not its identity
  const refs = useMemo(() => (ref ? [ref] : []), [refKey]);
  const [track] = useServerQueueTracks(refs);
  const time = useServerPlayerTime(state);

  if (!target || !ref) return null;

  if (!player) {
    return (
      <NowPlayingCard
        medium="vinyl"
        title={ref.title}
        artist={ref.artist}
        album={track?.album || detection?.album}
        coverUrl={artworkOf(track)}
        href={`/tracks/${encodeURIComponent(ref.track_id)}?friend_id=${ref.friend_id}`}
      />
    );
  }

  const send = (command: PlayerEdit) => {
    if (target.controller?.id === player.id) return void target.controller.command(command);
    if (!target.authorized) return void toaster.create({ title: LOCKED, type: "warning" });
    playerApi.command(player.id, command).catch((error: unknown) => {
      toaster.create({
        title: `Couldn't reach ${player.name}`,
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    });
  };
  const status = player.state.status;

  // Now playing shows the selected target. Switching to this player from this
  // device would move its upcoming queue onto the server, so that choice goes
  // through the Play on picker instead of happening behind a tap.
  const open = () => {
    if (target.target !== player.id) {
      if (target.target === "" && upcomingLocalTracks(local).length > 0) return openPicker(true);
      target.select(player.id);
    }
    drawer.open();
  };

  return (
    <NowPlayingCard
      medium="digital"
      outputName={player.name}
      title={ref.title}
      artist={ref.artist}
      album={track?.album}
      coverUrl={artworkOf(track)}
      progress={{ elapsed: time.currentTime, duration: time.duration }}
      transport={{
        isPlaying: status === "playing" || status === "loading",
        canPrev: entryIndex > 0,
        canNext: entryIndex < player.state.queue.length - 1,
        canPlay: true,
        onPrev: () => send({ type: "previous" }),
        // The play key only shows on a paused player (the one kept on screen).
        onPlay: () => send({ type: "resume" }),
        onPause: () => send({ type: "pause" }),
        onNext: () => send({ type: "next" }),
      }}
      onOpen={open}
    />
  );
}
