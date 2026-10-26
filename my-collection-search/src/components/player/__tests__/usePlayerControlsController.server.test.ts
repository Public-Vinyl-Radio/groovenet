// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ServerPlayer } from "@groovenet/contracts";
import { player, entryA, entryB } from "@/test/serverPlayerFixtures";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));
const local = vi.hoisted(() => ({
  isPlaying: false, currentTrackIndex: null, currentTrack: null, finishedTrack: null, playlist: [], volume: 1,
  play: vi.fn(), pause: vi.fn(), playNext: vi.fn(), playPrev: vi.fn(), seek: vi.fn(), playTrack: vi.fn(),
  removeFromQueue: vi.fn(), moveTrackInQueue: vi.fn(), setVolume: vi.fn(), clearQueue: vi.fn(), restoreQueue: vi.fn(),
  isAirPlayAvailable: true, isAirPlayActive: false, showAirPlayPicker: vi.fn(() => false),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => local }));
vi.mock("@/hooks/useServerQueueTracks", () => ({
  useServerQueueTracks: (entries: ServerPlayer["state"]["queue"]) => entries.map((entry) => ({ track_id: entry.track_id, friend_id: entry.friend_id, title: entry.title, artist: entry.artist })),
}));
const controller = vi.hoisted(() => ({ command: vi.fn(), setVolume: vi.fn(), getSnapshot: vi.fn() }));
const target = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({ useOptionalPlaybackTarget: () => target.value }));

import { usePlayerControlsController } from "@/components/player/usePlayerControlsController";

const reportProblem = vi.fn();
function serverTarget(p: ServerPlayer | null = player(), withController = true) {
  target.value = { target: "lounge", players: [player()], remote: { player: p }, controller: withController ? controller : null, reportProblem };
}
const sent = () => controller.command.mock.calls.map((call) => call[0]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  controller.command.mockResolvedValue(player("lounge", 9));
  serverTarget();
});
afterEach(() => vi.useRealTimers());

describe("usePlayerControlsController on a music server", () => {
  it("reads the server's queue, current entry, status and volume", () => {
    const { result } = renderHook(() => usePlayerControlsController());
    expect(result.current.mode).toBe("server");
    expect(result.current.serverName).toBe("Lounge");
    expect(result.current.playlist).toHaveLength(2);
    expect(result.current.currentTrackIndex).toBe(0);
    expect(result.current.currentTrack?.title).toBe("Track");
    expect([result.current.isPlaying, result.current.canPrev, result.current.canNext]).toEqual([false, false, true]);
    expect(result.current.volume).toBe(0.3);
    expect(result.current.volumeLabel).toBe("SERVER VOL");
    expect(result.current.seekOnRelease).toBe(true);
  });

  it("sends transport, seek and queue edits by entry ID", async () => {
    const { result } = renderHook(() => usePlayerControlsController());
    act(() => {
      result.current.handlePlay();
      result.current.handlePause();
      result.current.playNext();
      result.current.playPrev();
      result.current.playTrack(1);
      result.current.removeTrack(1);
      result.current.moveTrack(1, 0);
      result.current.playTrack(9);
    });
    await act(() => result.current.handleSeek(-3));
    expect(sent()).toEqual([
      { type: "resume" }, { type: "pause" }, { type: "next" }, { type: "previous" },
      { type: "play", entry_id: entryB }, { type: "queue.remove", entry_id: entryB }, { type: "queue.move", entry_id: entryB, to: 0 },
      { type: "seek", seconds: 0 },
    ]);
    expect(local.play).not.toHaveBeenCalled();
  });

  it("plays rather than resumes a stopped server, and treats an ended one as finished", () => {
    const p = player(); p.state.status = "ended"; p.state.current_entry_id = null;
    serverTarget(p);
    const { result } = renderHook(() => usePlayerControlsController());
    expect(result.current.isQueueFinished).toBe(true);
    expect(result.current.currentTrack).toBeNull();
    act(() => result.current.handlePlay());
    expect(sent()).toEqual([{ type: "play" }]);
  });

  it("holds a volume draft while dragging, sends once settled, then follows the server", () => {
    const { result } = renderHook(() => usePlayerControlsController());
    act(() => result.current.setVolume(0.62));
    expect(result.current.volume).toBe(0.62);
    expect(controller.setVolume).not.toHaveBeenCalled();
    act(() => result.current.commitVolume(0.624));
    expect(controller.setVolume).toHaveBeenCalledWith(62);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.volume).toBe(0.3);
    act(() => result.current.changeVolume(0));
    expect(controller.setVolume).toHaveBeenLastCalledWith(0);
    expect(local.setVolume).not.toHaveBeenCalled();
  });

  it("asks to unlock instead of sending while access is locked", () => {
    serverTarget(null, false);
    const { result } = renderHook(() => usePlayerControlsController());
    expect(result.current.serverName).toBe("Lounge");
    act(() => {
      result.current.handlePause();
      result.current.commitVolume(0.5);
      result.current.handleClearQueue();
    });
    expect(reportProblem).toHaveBeenCalledTimes(3);
    expect(controller.command).not.toHaveBeenCalled();
  });

  it("clears in one tap, and Undo restores the same entries and position at the cleared revision", async () => {
    const cleared = player("lounge", 7);
    controller.command.mockResolvedValueOnce(cleared);
    controller.getSnapshot.mockReturnValue({ player: cleared });
    const { result } = renderHook(() => usePlayerControlsController());
    await act(async () => result.current.handleClearQueue());
    expect(sent()).toEqual([{ type: "queue.clear" }]);
    const undo = toast.mock.calls[0]![0].action.onClick as () => void;
    act(() => undo());
    expect(controller.command.mock.lastCall).toEqual([
      { type: "queue.replace", entries: [{ id: entryA, track_id: "same-track", friend_id: 1 }, { id: entryB, track_id: "same-track", friend_id: 2 }], current_entry_id: entryA, position: 12, play: false },
      7,
    ]);
  });

  it("refuses Undo once another device has changed the queue, and offers none after a failed clear", async () => {
    controller.command.mockResolvedValueOnce(player("lounge", 7));
    controller.getSnapshot.mockReturnValue({ player: player("lounge", 8) });
    const { result } = renderHook(() => usePlayerControlsController());
    await act(async () => result.current.handleClearQueue());
    act(() => (toast.mock.calls[0]![0].action.onClick as () => void)());
    expect(toast.mock.lastCall![0].title).toBe("Queue changed since it was cleared");
    expect(controller.command).toHaveBeenCalledTimes(1);
    controller.command.mockResolvedValueOnce(null);
    await act(async () => result.current.handleClearQueue());
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it("names the server by ID until it loads, and warns when AirPlay can't open", () => {
    target.value = { target: "attic", players: [], remote: { player: null }, controller, reportProblem };
    const { result } = renderHook(() => usePlayerControlsController());
    expect(result.current.serverName).toBe("attic");
    expect(result.current.playlist).toEqual([]);
    act(() => result.current.handleAirPlayClick());
    expect(toast.mock.lastCall![0].title).toBe("AirPlay picker unavailable");
  });

  it("stays on this device's player without a server target", () => {
    target.value = { target: "" };
    const { result } = renderHook(() => usePlayerControlsController());
    act(() => {
      result.current.handlePlay();
      result.current.playTrack(0);
      result.current.removeTrack(0);
      result.current.moveTrack(0, 1);
      result.current.setVolume(0.4);
      result.current.commitVolume(0.4);
      result.current.playNext();
      result.current.playPrev();
      result.current.handlePause();
      void result.current.handleSeek(5);
    });
    expect(result.current.mode).toBe("local");
    expect(local.pause).toHaveBeenCalledTimes(1);
    expect(local.seek).toHaveBeenCalledWith(5);
    expect([local.play, local.playTrack, local.removeFromQueue, local.moveTrackInQueue, local.playNext, local.playPrev].every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(local.setVolume).toHaveBeenCalledWith(0.4);
    expect(controller.command).not.toHaveBeenCalled();
  });
});
