// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGenreResults, type GenreView } from "../useGenreResults";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import { queryKeys } from "@/lib/queryKeys";
const mocks = vi.hoisted(() => ({ searchAlbums: vi.fn(), searchTracks: vi.fn() }));
vi.mock("@/services/internalApi/albums", () => ({ searchAlbums: mocks.searchAlbums }));
vi.mock("@/services/internalApi/tracks", () => ({ searchTracks: mocks.searchTracks }));
const album = { release_id: "r1", friend_id: 6, title: "Album", artist: "Artist" };
const track = { track_id: "t1", friend_id: 6, title: "Song", artist: "Artist", album: "Album" };
function render(friendId: number | undefined, view: GenreView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(({ friendId, view }) => useGenreResults("salsa", friendId, view), {
      initialProps: { friendId, view },
      wrapper,
    }),
    client,
  };
}
describe("genre results ownership and pagination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAlbumStore.setState({ albums: new Map() });
    useTrackStore.setState({ tracks: new Map() });
    mocks.searchAlbums.mockResolvedValue({
      hits: [album],
      estimatedTotalHits: 25,
      offset: 0,
      limit: 24,
    });
    mocks.searchTracks.mockResolvedValue({
      hits: [track],
      estimatedTotalHits: 1,
      offset: 0,
      limit: 24,
    });
  });
  it("hydrates albums into Zustand, caches only refs, and reaches the next page", async () => {
    const { result, client } = render(6, "albums");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAlbumStore.getState().albums.get("r1:6")).toEqual(expect.objectContaining(album));
    expect(client.getQueryData(queryKeys.genreResults("salsa", 6, "albums"))).not.toHaveProperty(
      "pages.0.hits",
    );
    expect(result.current.data?.pages[0].refs).toEqual([{ id: "r1", friend_id: 6 }]);
    mocks.searchAlbums.mockResolvedValue({
      hits: [{ ...album, release_id: "r2" }],
      estimatedTotalHits: 25,
      offset: 24,
      limit: 24,
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocks.searchAlbums).toHaveBeenLastCalledWith({
      genre: ["salsa"],
      friend_id: 6,
      limit: 24,
      offset: 24,
    });
    expect(result.current.hasNextPage).toBe(false);
  });
  it("uses the same genre and collection filters for tracks, caching refs and hydrating entities", async () => {
    const { result } = render(6, "tracks");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.searchTracks).toHaveBeenCalledWith({
      genre: ["salsa"],
      filter: "friend_id = 6",
      limit: 24,
      offset: 0,
    });
    expect(useTrackStore.getState().tracks.get("t1:6")).toMatchObject(track);
    expect(result.current.hasNextPage).toBe(false);
  });
  it("waits for a friend and isolates collections and views", async () => {
    const { result, rerender } = render(undefined, "albums");
    expect(result.current.fetchStatus).toBe("idle");
    expect(mocks.searchAlbums).not.toHaveBeenCalled();
    rerender({ friendId: 7, view: "tracks" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.searchTracks.mock.calls[0][0].filter).toBe("friend_id = 7");
    expect(mocks.searchAlbums).not.toHaveBeenCalled();
  });
  it("stops on an empty page even if a stale total claims more", async () => {
    mocks.searchAlbums.mockResolvedValue({
      hits: [],
      estimatedTotalHits: 50,
      offset: 0,
      limit: 24,
    });
    const { result } = render(6, "albums");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
  it("exposes a request failure", async () => {
    mocks.searchTracks.mockRejectedValue(new Error("Offline"));
    const { result } = render(6, "tracks");
    await waitFor(() => expect(result.current.error?.message).toBe("Offline"));
  });
});
