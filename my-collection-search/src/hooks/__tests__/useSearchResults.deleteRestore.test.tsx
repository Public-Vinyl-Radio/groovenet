// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ searchTracks: vi.fn(), softDeleteTrack: vi.fn() }));

vi.mock("@/services/internalApi/tracks", () => ({
  searchTracks: mocks.searchTracks,
  softDeleteTrack: mocks.softDeleteTrack,
  fetchPlaylistCounts: vi.fn(async () => ({})),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" } }),
}));

import { useSearchResults } from "../useSearchResults";
import { useDeleteTrackMutation } from "../useDeleteTrackMutation";
import { useTrackStore } from "@/stores/trackStore";

const hit = (id: string) => ({ track_id: id, friend_id: 1, release_id: "r1", title: id });
const page = (...ids: string[]) => ({
  hits: ids.map(hit),
  estimatedTotalHits: ids.length,
  offset: 0,
  limit: 20,
  processingTimeMs: 1,
});

beforeEach(() => {
  useTrackStore.getState().clearTracks();
  mocks.searchTracks.mockReset();
  mocks.softDeleteTrack.mockReset().mockResolvedValue({ success: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("deleting and restoring a track in a results list", () => {
  it("removes the track from results and the store, and a restore brings it back", async () => {
    mocks.searchTracks.mockResolvedValue(page("a", "b"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ search: useSearchResults({}), del: useDeleteTrackMutation() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.search.trackInfo).toHaveLength(2));
    await waitFor(() => expect(useTrackStore.getState().getTrack("a", 1)).toBeDefined());

    // Delete "a": the refetch no longer returns it.
    mocks.searchTracks.mockResolvedValue(page("b"));
    await act(() => result.current.del.mutateAsync({ track_id: "a", friend_id: 1 }));

    await waitFor(() =>
      expect(result.current.search.trackInfo).toEqual([{ trackId: "b", friendId: 1 }]),
    );
    expect(useTrackStore.getState().getTrack("a", 1)).toBeUndefined();
    expect(useTrackStore.getState().getTrack("b", 1)).toBeDefined();

    // Restore "a" (POST /api/tracks/a/restore): the normal refetch returns it
    // and it is hydrated into the store again.
    mocks.searchTracks.mockResolvedValue(page("a", "b"));
    await act(() => qc.invalidateQueries({ queryKey: ["tracks"] }));

    await waitFor(() => expect(result.current.search.trackInfo).toHaveLength(2));
    await waitFor(() => expect(useTrackStore.getState().getTrack("a", 1)).toBeDefined());
  });
});
