// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAlbumStore } from "@/stores/albumStore";
import { queryKeys } from "@/lib/queryKeys";
import { useRecentAlbumsQuery } from "../useRecentAlbumsQuery";
const searchAlbums = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/albums", () => ({ searchAlbums }));
const album = { release_id: "one", friend_id: 6, title: "First", artist: "Artist", track_count: 1 };
function setup(friendId?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(({ id }) => useRecentAlbumsQuery(id), { wrapper, initialProps: { id: friendId } }) };
}
describe("useRecentAlbumsQuery", () => {
  beforeEach(() => { searchAlbums.mockReset().mockResolvedValue({ hits: [album] }); useAlbumStore.getState().clearAlbums(); });
  it("waits for a collection then fetches the latest four and caches only refs", async () => {
    const { result, rerender, client } = setup();
    expect(result.current.fetchStatus).toBe("idle");
    expect(searchAlbums).not.toHaveBeenCalled();
    rerender({ id: 6 });
    await waitFor(() => expect(result.current.albums).toEqual([album]));
    expect(searchAlbums).toHaveBeenCalledWith({ friend_id: 6, sort: "created_at:desc", limit: 4 });
    expect(client.getQueryData(queryKeys.recentAlbums(6))).toEqual(["one:6"]);
    act(() => useAlbumStore.getState().updateAlbum("one", 6, { title: "Edited" }));
    expect(result.current.albums[0].title).toBe("Edited");
    act(() => useAlbumStore.getState().clearAlbums());
    expect(result.current.albums).toEqual([]);
  });
  it("does not show the previous collection's albums while another loads", async () => {
    const { result, rerender } = setup(6);
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    searchAlbums.mockReturnValue(new Promise(() => {}));
    rerender({ id: 7 });
    expect(result.current.albums).toEqual([]);
    expect(searchAlbums).toHaveBeenLastCalledWith({ friend_id: 7, sort: "created_at:desc", limit: 4 });
  });
  it("exposes fetch errors and accepts an empty collection", async () => {
    searchAlbums.mockRejectedValue(new Error("offline"));
    const { result, rerender } = setup(6);
    await waitFor(() => expect(result.current.error?.message).toBe("offline"));
    searchAlbums.mockResolvedValue({ hits: [] });
    rerender({ id: 7 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.albums).toEqual([]);
  });
});
