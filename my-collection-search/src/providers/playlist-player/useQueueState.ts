"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "@/types/track";

export type ReplacePlaylistOptions = {
  preserveCurrent?: boolean;
  startIndex?: number;
  startTrackId?: string;
  autoplay?: boolean;
};

type UseQueueStateArgs = {
  initial: Track[];
  onPauseImmediate?: () => void;
};

export type QueueSnapshot = {
  playlist: Track[];
  currentTrackIndex: number | null;
  isPlaying: boolean;
  finishedTrack: Track | null;
};

export function adjustCurrentIndexAfterMove(
  currentIdx: number | null,
  fromIndex: number,
  toIndex: number
): number | null {
  if (currentIdx === null) return null;

  if (currentIdx === fromIndex) {
    return toIndex;
  } else if (fromIndex < currentIdx && toIndex >= currentIdx) {
    return currentIdx - 1;
  } else if (fromIndex > currentIdx && toIndex <= currentIdx) {
    return currentIdx + 1;
  }
  return currentIdx;
}

export function reorderPlaylist(
  currentPlaylist: Track[],
  fromIndex: number,
  toIndex: number
): Track[] {
  const newPlaylist = [...currentPlaylist];
  const [movedTrack] = newPlaylist.splice(fromIndex, 1);
  newPlaylist.splice(toIndex, 0, movedTrack);
  return newPlaylist;
}

export function removeFromPlaylist(
  currentPlaylist: Track[],
  removeIndex: number,
  currentIdx: number | null
): {
  nextPlaylist: Track[];
  nextCurrentTrackIndex: number | null;
  shouldStop: boolean;
} {
  const nextPlaylist = [...currentPlaylist];
  nextPlaylist.splice(removeIndex, 1);

  if (currentIdx === null) {
    return {
      nextPlaylist,
      nextCurrentTrackIndex: null,
      shouldStop: false,
    };
  }

  if (currentIdx === removeIndex) {
    if (nextPlaylist.length === 0) {
      return {
        nextPlaylist,
        nextCurrentTrackIndex: null,
        shouldStop: true,
      };
    }
    if (removeIndex < nextPlaylist.length) {
      return {
        nextPlaylist,
        nextCurrentTrackIndex: removeIndex,
        shouldStop: false,
      };
    }
    return {
      nextPlaylist,
      nextCurrentTrackIndex: nextPlaylist.length - 1,
      shouldStop: false,
    };
  }

  if (currentIdx > removeIndex) {
    return {
      nextPlaylist,
      nextCurrentTrackIndex: currentIdx - 1,
      shouldStop: false,
    };
  }

  return {
    nextPlaylist,
    nextCurrentTrackIndex: currentIdx,
    shouldStop: false,
  };
}

export function useQueueState({ initial, onPauseImmediate }: UseQueueStateArgs) {
  const playlistRef = useRef<Track[]>(initial);
  const [playlist, setPlaylist] = useState<Track[]>(initial);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [plVersion, setPlVersion] = useState(0);
  const [finishedTrack, setFinishedTrack] = useState<Track | null>(null);

  const play = useCallback(() => {
    const pl = playlistRef.current;
    if (!pl.length) return;
    setFinishedTrack(null);
    setIsPlaying(true);
    setCurrentTrackIndex((idx) => (idx === null || idx >= pl.length ? 0 : idx));
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    onPauseImmediate?.();
  }, [onPauseImmediate]);

  const stop = useCallback(() => {
    setFinishedTrack(null);
    setIsPlaying(false);
    setCurrentTrackIndex(null);
  }, []);

  const playNext = useCallback(() => {
    const pl = playlistRef.current;
    setCurrentTrackIndex((idx) => {
      if (idx === null || !pl.length) return idx;
      if (idx < pl.length - 1) {
        setIsPlaying(true);
        return idx + 1;
      }
      setIsPlaying(false);
      setFinishedTrack(pl[idx]);
      return null;
    });
  }, []);

  const playPrev = useCallback(() => {
    setCurrentTrackIndex((idx) => {
      const pl = playlistRef.current;
      if (idx === null || !pl.length) return idx;
      if (idx > 0) {
        setIsPlaying(true);
        return idx - 1;
      }
      return idx;
    });
  }, []);

  const playTrack = useCallback((index: number) => {
    const pl = playlistRef.current;
    if (index >= 0 && index < pl.length) {
      setFinishedTrack(null);
      setCurrentTrackIndex(index);
      setIsPlaying(true);
    }
  }, []);

  const replacePlaylist = useCallback(
    (next: Track[], opts: ReplacePlaylistOptions = {}) => {
      const {
        preserveCurrent = true,
        startIndex,
        startTrackId,
        autoplay,
      } = opts;

      playlistRef.current = Array.isArray(next) ? next.slice() : [];
      setPlaylist(playlistRef.current);
      setPlVersion((v) => v + 1);
      setFinishedTrack(null);

      let newIndex: number | null = null;
      const pl = playlistRef.current;

      if (typeof startIndex === "number") {
        newIndex =
          startIndex >= 0 && startIndex < pl.length ? startIndex : null;
      } else if (typeof startTrackId === "string") {
        const idx = pl.findIndex((t) => t.track_id === startTrackId);
        newIndex = idx !== -1 ? idx : pl.length ? 0 : null;
      } else if (preserveCurrent && currentTrackIndex !== null) {
        const prev = pl[currentTrackIndex];
        if (prev) {
          const idx = pl.findIndex((t) => t.track_id === prev.track_id);
          newIndex = idx !== -1 ? idx : pl.length ? 0 : null;
        } else {
          newIndex = pl.length ? 0 : null;
        }
      } else {
        newIndex = pl.length ? 0 : null;
      }

      setCurrentTrackIndex(newIndex);

      if (typeof autoplay === "boolean") {
        setIsPlaying(autoplay && newIndex !== null);
      } else {
        setIsPlaying((was) => (newIndex !== null ? was : false));
      }
    },
    [currentTrackIndex]
  );

  const appendToQueue = useCallback((items: Track[] | Track) => {
    const toAdd = Array.isArray(items) ? items : [items];
    if (!toAdd.length) return;
    playlistRef.current = [...playlistRef.current, ...toAdd];
    setPlaylist(playlistRef.current);
    setPlVersion((v) => v + 1);
    setFinishedTrack(null);
  }, []);

  const enqueueNext = useCallback(
    (items: Track[] | Track) => {
      const toAdd = Array.isArray(items) ? items : [items];
      if (!toAdd.length) return;

      const idx = currentTrackIndex ?? -1;
      if (idx < 0) {
        replacePlaylist(toAdd, { startIndex: 0, autoplay: true });
        return;
      }
      const head = playlistRef.current.slice(0, idx + 1);
      const tail = playlistRef.current.slice(idx + 1);
      playlistRef.current = [...head, ...toAdd, ...tail];
      setPlaylist(playlistRef.current);
      setPlVersion((v) => v + 1);
    },
    [currentTrackIndex, replacePlaylist]
  );

  const clearQueue = useCallback(() => {
    playlistRef.current = [];
    setPlaylist([]);
    setPlVersion((v) => v + 1);
    setCurrentTrackIndex(null);
    setIsPlaying(false);
    setFinishedTrack(null);
  }, []);

  const restoreQueue = useCallback((snapshot: QueueSnapshot) => {
    playlistRef.current = snapshot.playlist.slice();
    setPlaylist(playlistRef.current);
    setPlVersion((v) => v + 1);
    setCurrentTrackIndex(snapshot.currentTrackIndex);
    setIsPlaying(snapshot.isPlaying);
    setFinishedTrack(snapshot.finishedTrack);
  }, []);

  const moveTrackInQueue = useCallback((fromIndex: number, toIndex: number) => {
    const currentPlaylist = playlistRef.current;
    if (
      fromIndex < 0 ||
      fromIndex >= currentPlaylist.length ||
      toIndex < 0 ||
      toIndex >= currentPlaylist.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const newPlaylist = reorderPlaylist(currentPlaylist, fromIndex, toIndex);

    playlistRef.current = newPlaylist;
    setPlaylist(newPlaylist);
    setPlVersion((v) => v + 1);

    setCurrentTrackIndex((currentIdx) =>
      adjustCurrentIndexAfterMove(currentIdx, fromIndex, toIndex)
    );
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    const currentPlaylist = playlistRef.current;
    if (index < 0 || index >= currentPlaylist.length) {
      return;
    }

    const result = removeFromPlaylist(currentPlaylist, index, currentTrackIndex);
    playlistRef.current = result.nextPlaylist;
    setPlaylist(result.nextPlaylist);
    setPlVersion((v) => v + 1);
    setFinishedTrack(null);
    if (result.shouldStop) {
      setIsPlaying(false);
    }
    setCurrentTrackIndex(result.nextCurrentTrackIndex);
  }, [currentTrackIndex]);

  // Keep currentTrack state in sync with index/playlist
  useEffect(() => {
    if (currentTrackIndex !== null && playlistRef.current[currentTrackIndex]) {
      setCurrentTrack(playlistRef.current[currentTrackIndex]);
      setFinishedTrack(null);
    } else {
      setCurrentTrack(null);
    }
  }, [currentTrackIndex, plVersion]);

  return {
    playlistRef,
    playlist,
    currentTrack,
    currentTrackIndex,
    isPlaying,
    plVersion,
    finishedTrack,
    setPlaylist,
    setCurrentTrackIndex,
    setIsPlaying,
    setPlVersion,
    play,
    pause,
    stop,
    playNext,
    playPrev,
    playTrack,
    replacePlaylist,
    appendToQueue,
    enqueueNext,
    clearQueue,
    restoreQueue,
    moveTrackInQueue,
    removeFromQueue,
  };
}
