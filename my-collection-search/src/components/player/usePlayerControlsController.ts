"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { FiVolume2, FiVolume1, FiVolumeX } from "react-icons/fi";
import type { ServerQueueEntry } from "@groovenet/contracts";
import { usePlaylistPlayer } from "@/providers/PlaylistPlayerProvider";
import { useOptionalPlaybackTarget } from "@/providers/PlaybackTargetProvider";
import type { PlayerEdit } from "@/providers/server-player/controller";
import { useServerQueueTracks } from "@/hooks/useServerQueueTracks";
import { toaster } from "@/components/ui/toaster";

const noEntries: ServerQueueEntry[] = [];

/**
 * The one model behind the mini player, Now playing, the queue and the
 * desktop bar. It reads this browser's player, or the selected music server
 * when there is one, so both modes share every surface (#793).
 */
export function usePlayerControlsController() {
  const local = usePlaylistPlayer();
  const target = useOptionalPlaybackTarget();
  const server = target && target.target !== "" ? target : null;
  const controller = server?.controller ?? null;
  const player = server?.remote.player ?? null;
  const entries = player?.state.queue ?? noEntries;
  const serverTracks = useServerQueueTracks(entries);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(draftTimer.current), []);

  const send = useCallback(
    (command: PlayerEdit) => {
      if (controller) void controller.command(command);
      else server?.reportProblem("Unlock server access before trying this action again.");
    },
    [controller, server]
  );

  const serverIndex = player ? entries.findIndex((entry) => entry.id === player.state.current_entry_id) : -1;
  const status = player?.state.status;

  const playlist = server ? serverTracks : local.playlist;
  const currentTrackIndex = server ? (serverIndex < 0 ? null : serverIndex) : local.currentTrackIndex;
  const isPlaying = server ? status === "playing" || status === "loading" : local.isPlaying;
  const isQueueFinished = server ? status === "ended" && currentTrackIndex === null : local.currentTrackIndex === null && local.finishedTrack !== null;
  const displayTrack = server ? (currentTrackIndex === null ? null : serverTracks[currentTrackIndex] ?? null) : local.currentTrack ?? local.finishedTrack;
  const volume = server ? volumeDraft ?? (player?.state.volume ?? 0) / 100 : local.volume;

  const safeLen = playlist.length;
  const canPrev = currentTrackIndex !== null && currentTrackIndex > 0;
  const canNext = currentTrackIndex !== null && currentTrackIndex < safeLen - 1;

  const VolumeIcon = useMemo<IconType>(() => {
    if (volume === 0) return FiVolumeX;
    if (volume < 0.5) return FiVolume1;
    return FiVolume2;
  }, [volume]);

  const entryAt = (index: number) => entries[index]?.id;

  const handlePlay = useCallback(() => {
    if (server) send({ type: status === "paused" ? "resume" : "play" });
    else local.play();
  }, [server, send, status, local]);

  const handlePause = useCallback(() => {
    if (server) send({ type: "pause" });
    else local.pause();
  }, [server, send, local]);

  const playNext = useCallback(() => (server ? send({ type: "next" }) : local.playNext()), [server, send, local]);
  const playPrev = useCallback(() => (server ? send({ type: "previous" }) : local.playPrev()), [server, send, local]);

  const handleSeek = useCallback(
    async (time: number) => {
      if (server) send({ type: "seek", seconds: Math.max(0, time) });
      else local.seek(time);
    },
    [server, send, local]
  );

  const playTrack = (index: number) => {
    const id = entryAt(index);
    if (!server) local.playTrack(index);
    else if (id) send({ type: "play", entry_id: id });
  };
  const removeTrack = (index: number) => {
    const id = entryAt(index);
    if (!server) local.removeFromQueue(index);
    else if (id) send({ type: "queue.remove", entry_id: id });
  };
  const moveTrack = (from: number, to: number) => {
    const id = entryAt(from);
    if (!server) local.moveTrackInQueue(from, to);
    else if (id) send({ type: "queue.move", entry_id: id, to });
  };

  /** While dragging: local audio follows at once; a server's slider holds the draft. */
  const setVolume = (value: number) => {
    if (!server) return local.setVolume(value);
    clearTimeout(draftTimer.current);
    setVolumeDraft(Math.max(0, Math.min(1, value)));
  };
  /** Once the slider settles: one volume command to the server. */
  const commitVolume = (value: number) => {
    if (!server) return;
    if (controller) controller.setVolume(Math.round(Math.max(0, Math.min(1, value)) * 100));
    else server.reportProblem("Unlock server access before trying this action again.");
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => setVolumeDraft(null), 2000);
  };
  /** Mute and similar one-shot changes. */
  const changeVolume = (value: number) => {
    setVolume(value);
    commitVolume(value);
  };

  const handleAirPlayClick = useCallback(() => {
    const opened = local.showAirPlayPicker();
    if (!opened) {
      toaster.create({
        title: "AirPlay picker unavailable",
        description: "Safari did not expose AirPlay for this media session.",
        type: "warning",
      });
    }
  }, [local]);

  // The queue's Clear: one tap, then a "Queue cleared" toast whose Undo puts
  // back the exact queue, position and play state. No confirmation dialog.
  const handleClearQueue = useCallback(() => {
    if (server) {
      if (!player || !controller) return send({ type: "queue.clear" });
      const snapshot = structuredClone(player.state);
      void controller.command({ type: "queue.clear" }).then((cleared) => {
        if (!cleared) return;
        const clearedRevision = cleared.revision;
        toaster.create({
          title: "Queue cleared",
          type: "info",
          action: {
            label: "Undo",
            onClick: () => {
              // Do not overwrite edits made by another controller after the clear.
              if (controller.getSnapshot().player?.revision !== clearedRevision) {
                toaster.create({ title: "Queue changed since it was cleared", description: "Undo is no longer available.", type: "warning" });
                return;
              }
              void controller.command(
                {
                  type: "queue.replace",
                  entries: snapshot.queue.map(({ id, track_id, friend_id }) => ({ id, track_id, friend_id })),
                  current_entry_id: snapshot.current_entry_id,
                  position: snapshot.position,
                  play: snapshot.status === "playing",
                },
                clearedRevision
              );
            },
          },
        });
      });
      return;
    }
    const snapshot = {
      playlist: local.playlist.slice(),
      currentTrackIndex: local.currentTrackIndex,
      isPlaying: local.isPlaying,
      finishedTrack: local.finishedTrack,
    };
    local.pause();
    local.clearQueue();
    toaster.create({
      title: "Queue cleared",
      type: "info",
      action: {
        label: "Undo",
        onClick: () => local.restoreQueue(snapshot),
      },
    });
  }, [server, player, controller, send, local]);

  return {
    /** `server` while a music server is the target. */
    mode: server ? ("server" as const) : ("local" as const),
    serverName: server ? player?.name ?? server.players.find((p) => p.id === server.target)?.name ?? server.target : null,
    isPlaying,
    currentTrack: displayTrack,
    currentTrackIndex,
    isQueueFinished,
    playlist,
    volume,
    setVolume,
    commitVolume,
    changeVolume,
    volumeLabel: server ? "SERVER VOL" : "VOL",
    isAirPlayAvailable: local.isAirPlayAvailable,
    isAirPlayActive: local.isAirPlayActive,
    playNext,
    playPrev,
    playTrack,
    removeTrack,
    moveTrack,
    safeLen,
    canPrev,
    canNext,
    VolumeIcon,
    handlePlay,
    handlePause,
    handleSeek,
    /** A server seeks once on release rather than scrubbing. */
    seekOnRelease: server !== null,
    handleAirPlayClick,
    handleClearQueue,
  };
}
