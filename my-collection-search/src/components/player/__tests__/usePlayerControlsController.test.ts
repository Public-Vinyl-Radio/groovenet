// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Track } from "@/types/track";

const createMock = vi.fn();
vi.mock("@/components/ui/toaster", () => ({
  toaster: { create: (...args: unknown[]) => createMock(...args) },
}));

const pause = vi.fn();
const clearQueue = vi.fn();
const restoreQueue = vi.fn();
const playlistPlayerState = {
  isPlaying: true,
  currentTrackIndex: 1,
  currentTrack: null as Track | null,
  finishedTrack: null as Track | null,
  seek: vi.fn(),
  play: vi.fn(),
  pause,
  playNext: vi.fn(),
  playPrev: vi.fn(),
  clearQueue,
  restoreQueue,
  playlist: [] as Track[],
  volume: 1,
  setVolume: vi.fn(),
  isAirPlayAvailable: false,
  isAirPlayActive: false,
  showAirPlayPicker: vi.fn(),
};

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => playlistPlayerState,
}));

import { usePlayerControlsController } from "@/components/player/usePlayerControlsController";

function makeTrack(id: string): Track {
  return {
    track_id: id,
    id: 1,
    title: `Title ${id}`,
    artist: "Artist",
    album: "Album",
    friend_id: 1,
    username: "alice",
  } as Track;
}

describe("usePlayerControlsController — isQueueFinished", () => {
  beforeEach(() => {
    playlistPlayerState.currentTrack = null;
    playlistPlayerState.finishedTrack = null;
    playlistPlayerState.currentTrackIndex = 1;
  });

  it("is false while a track is current, even with a stale finishedTrack", () => {
    playlistPlayerState.currentTrackIndex = 1;
    playlistPlayerState.finishedTrack = makeTrack("stale");

    const { result } = renderHook(() => usePlayerControlsController());

    expect(result.current.isQueueFinished).toBe(false);
  });

  it("is false once the index is null but nothing has finished yet", () => {
    playlistPlayerState.currentTrackIndex = null;
    playlistPlayerState.finishedTrack = null;

    const { result } = renderHook(() => usePlayerControlsController());

    expect(result.current.isQueueFinished).toBe(false);
  });

  it("is true once the index is null and a track finished, and displays it", () => {
    playlistPlayerState.currentTrackIndex = null;
    playlistPlayerState.finishedTrack = makeTrack("d");

    const { result } = renderHook(() => usePlayerControlsController());

    expect(result.current.isQueueFinished).toBe(true);
    expect(result.current.currentTrack?.track_id).toBe("d");
  });
});

describe("usePlayerControlsController — handleDismissPlayer", () => {
  beforeEach(() => {
    createMock.mockClear();
    pause.mockClear();
    clearQueue.mockClear();
    restoreQueue.mockClear();
    playlistPlayerState.playlist = [makeTrack("a"), makeTrack("b")];
    playlistPlayerState.currentTrackIndex = 1;
    playlistPlayerState.isPlaying = true;
    playlistPlayerState.finishedTrack = null;
  });

  it("pauses and clears the queue", () => {
    const { result } = renderHook(() => usePlayerControlsController());

    act(() => { result.current.handleDismissPlayer(); });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(clearQueue).toHaveBeenCalledTimes(1);
  });

  it("shows an undo toast that restores the exact prior queue state", () => {
    const { result } = renderHook(() => usePlayerControlsController());
    const snapshotPlaylist = playlistPlayerState.playlist;
    const snapshotIndex = playlistPlayerState.currentTrackIndex;
    const snapshotIsPlaying = playlistPlayerState.isPlaying;

    act(() => { result.current.handleDismissPlayer(); });

    expect(createMock).toHaveBeenCalledTimes(1);
    const toastArgs = createMock.mock.calls[0][0];
    expect(toastArgs.title).toMatch(/queue cleared/i);
    expect(toastArgs.action.label).toBe("Undo");

    act(() => { toastArgs.action.onClick(); });

    expect(restoreQueue).toHaveBeenCalledWith({
      playlist: snapshotPlaylist,
      currentTrackIndex: snapshotIndex,
      isPlaying: snapshotIsPlaying,
      finishedTrack: null,
    });
  });
});
