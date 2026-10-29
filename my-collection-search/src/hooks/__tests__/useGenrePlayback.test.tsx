// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGenrePlayback } from "../useGenrePlayback";
const mocks = vi.hoisted(() => ({
  searchTracks: vi.fn(),
  replacePlaylist: vi.fn(),
  setTracks: vi.fn(),
}));
vi.mock("@/services/internalApi/tracks", () => ({ searchTracks: mocks.searchTracks }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: mocks.replacePlaylist }),
}));
vi.mock("@/stores/trackStore", () => ({
  useTrackStore: { getState: () => ({ setTracks: mocks.setTracks }) },
}));
const track = (id: string, audio: string | null = `${id}.flac`) => ({
  track_id: id,
  friend_id: 6,
  local_audio_url: audio,
});
const render = (friendId: number | undefined) =>
  renderHook(({ id }) => useGenrePlayback("salsa", id), { initialProps: { id: friendId } });
describe("genre playback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("fetches beyond the detail samples and loaded UI pages, then plays the full deduplicated playable set", async () => {
    mocks.searchTracks
      .mockResolvedValueOnce({
        hits: [track("a"), track("missing", null), track("blank", "  ")],
        estimatedTotalHits: 203,
        offset: 0,
        limit: 200,
      })
      .mockResolvedValueOnce({
        hits: [track("b"), track("a")],
        estimatedTotalHits: 203,
        offset: 200,
        limit: 200,
      });
    const { result } = render(6);
    await act(async () => {
      await result.current.play(false);
    });
    expect(mocks.searchTracks).toHaveBeenNthCalledWith(2, {
      genre: ["salsa"],
      filter: "friend_id = 6",
      limit: 200,
      offset: 200,
    });
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([track("a"), track("b")], {
      autoplay: true,
      startIndex: 0,
    });
    expect(mocks.setTracks).toHaveBeenCalledTimes(2);
    expect(result.current.busy).toBe(false);
  });
  it("shuffles all playable tracks before handing them to the output flow", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.searchTracks.mockResolvedValue({
      hits: [track("a"), track("b"), track("c")],
      estimatedTotalHits: 3,
      offset: 0,
      limit: 200,
    });
    const { result } = render(6);
    await act(async () => {
      await result.current.play(true);
    });
    expect(
      mocks.replacePlaylist.mock.calls[0][0].map((t: { track_id: string }) => t.track_id),
    ).toEqual(["b", "c", "a"]);
    vi.restoreAllMocks();
  });
  it("does not replace the queue without playable tracks, and stops on empty pages", async () => {
    mocks.searchTracks.mockResolvedValue({
      hits: [],
      estimatedTotalHits: 2000,
      offset: 0,
      limit: 200,
    });
    const { result } = render(6);
    await act(async () => {
      await result.current.play(false);
    });
    expect(result.current.problem).toBe("No playable tracks in this genre yet.");
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
    expect(mocks.searchTracks).toHaveBeenCalledTimes(1);
  });
  it("handles a malformed zero page limit without looping", async () => {
    mocks.searchTracks.mockResolvedValue({
      hits: [track("a")],
      estimatedTotalHits: 10,
      offset: 0,
      limit: 0,
    });
    const { result } = render(6);
    await act(async () => {
      await result.current.play(false);
    });
    expect(mocks.searchTracks).toHaveBeenCalledTimes(1);
    expect(mocks.replacePlaylist).toHaveBeenCalledOnce();
  });
  it("reports failures, clears busy, and allows a retry", async () => {
    mocks.searchTracks.mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce("failed");
    const { result } = render(6);
    await act(async () => {
      await result.current.play(false);
    });
    expect(result.current.problem).toBe("Offline");
    expect(result.current.busy).toBe(false);
    await act(async () => {
      await result.current.play(false);
    });
    expect(result.current.problem).toContain("load tracks");
  });
  it("ignores missing collections and duplicate clicks while fetching", async () => {
    const { result, rerender } = render(undefined);
    await act(async () => {
      await result.current.play(false);
    });
    expect(mocks.searchTracks).not.toHaveBeenCalled();
    rerender({ id: 6 });
    let resolve!: (value: unknown) => void;
    mocks.searchTracks.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.play(false);
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.play(true);
    });
    expect(mocks.searchTracks).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ hits: [], estimatedTotalHits: 0, offset: 0, limit: 200 });
      await pending;
    });
  });
  it.each(["resolve", "reject"])(
    "discards old collection playback on %s after switching",
    async (outcome) => {
      let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
      mocks.searchTracks.mockReturnValue(
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      );
      const { result, rerender } = render(6);
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.play(false);
      });
      rerender({ id: 7 });
      await act(async () => {
        if (outcome === "resolve")
          resolve({ hits: [track("a")], estimatedTotalHits: 1, offset: 0, limit: 200 });
        else reject(new Error("Old error"));
        await pending;
      });
      expect(mocks.replacePlaylist).not.toHaveBeenCalled();
      expect(result.current.problem).toBeNull();
      expect(result.current.busy).toBe(false);
    },
  );
});
