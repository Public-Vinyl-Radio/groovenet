// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { setAnalyticsProvider } from "@/lib/analytics/client";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";
import { usePlaylistMutations, type PlaylistOrderingOptions } from "../usePlaylistMutations";

const optimizePlaylist = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/playlists", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  optimizePlaylist,
}));

const refs = [
  { track_id: "a", friend_id: 1 },
  { track_id: "b", friend_id: 1 },
];
const tracks = refs.map((ref) => ({ ...ref, title: ref.track_id }) as Track);
const events = new MemoryAnalyticsProvider();

function setup(ordering?: PlaylistOrderingOptions, initial: unknown = refs) {
  const client = new QueryClient();
  client.setQueryData(queryKeys.playlistTrackIds(5), initial);
  const { result } = renderHook(() => usePlaylistMutations(5, vi.fn(), ordering), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { client, result };
}

beforeEach(() => {
  optimizePlaylist.mockReset();
  events.reset();
  setAnalyticsProvider(events);
  useTrackStore.getState().setTracks(tracks as never);
});

describe("usePlaylistMutations optimiser (#1193)", () => {
  it("orders by the chosen profile and remembers which one ordered it", async () => {
    optimizePlaylist.mockResolvedValue({
      tracks: [tracks[1], tracks[0]],
      ranking: { id: "beatmatcher", name: "Beatmatcher", fallback: false },
    });
    const { client, result } = setup({ rankingProfileId: "beatmatcher", friendId: 1 });
    act(() => result.current.sortGenetic());
    await waitFor(() => expect(result.current.orderedBy?.name).toBe("Beatmatcher"));
    expect(optimizePlaylist).toHaveBeenCalledWith(expect.any(Array), "genetic", {
      ranking: "beatmatcher",
      friendId: 1,
    });
    expect(client.getQueryData(queryKeys.playlistTrackIds(5))).toEqual([refs[1], refs[0]]);
    expect(events.events.at(-1)).toMatchObject({
      event: "playlist_sorted",
      properties: { sort_algorithm: "genetic", track_count: 2, profile: "beatmatcher" },
    });

    // Moving a track by hand means the profile no longer ordered it.
    act(() => result.current.moveTrack(0, 1));
    expect(result.current.orderedBy).toBeNull();
  });

  it("records a stored profile as custom, and greedy clears what ordered it", async () => {
    optimizePlaylist.mockResolvedValue({
      tracks: [tracks[1], tracks[0]],
      ranking: { id: "12", name: "Peak time", fallback: false },
    });
    const { result } = setup({ rankingProfileId: "12" });
    act(() => result.current.sortCohesiveBlocks());
    await waitFor(() => expect(result.current.orderedBy?.id).toBe("12"));
    expect(events.events.at(-1)?.properties).toMatchObject({ profile: "custom" });
    act(() => result.current.sortGreedy());
    expect(result.current.orderedBy).toBeNull();
  });

  it("asks nothing of the server for an empty playlist or tracks it hasn't loaded", async () => {
    const empty = setup({ rankingProfileId: "selector" }, []);
    act(() => empty.result.current.sortGenetic());
    await waitFor(() => expect(empty.result.current.isGeneticSorting).toBe(false));
    const unloaded = setup({ rankingProfileId: "selector" }, [{ track_id: "zz", friend_id: 9 }]);
    act(() => unloaded.result.current.sortGenetic());
    await waitFor(() => expect(unloaded.result.current.isGeneticSorting).toBe(false));
    expect(optimizePlaylist).not.toHaveBeenCalled();
    expect(events.events).toEqual([]);
    expect(unloaded.result.current.orderedBy).toBeNull();
  });

  it("leaves the profile out of analytics when an older server doesn't report one", async () => {
    optimizePlaylist.mockResolvedValue({ tracks: [tracks[1], tracks[0]], ranking: null });
    const { result } = setup();
    act(() => result.current.sortGenetic());
    await waitFor(() => expect(events.events).toHaveLength(1));
    expect(events.events[0].properties).not.toHaveProperty("profile");
    expect(optimizePlaylist).toHaveBeenCalledWith(expect.any(Array), "genetic", {
      ranking: undefined,
      friendId: undefined,
    });
    expect(result.current.orderedBy).toBeNull();
  });
});
