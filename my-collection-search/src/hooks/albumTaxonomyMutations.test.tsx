// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUpdateAlbumMutation } from "./useAlbumsQuery";
import { useUpdateAlbumWithTracksMutation } from "./useUpdateAlbumWithTracksMutation";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Album } from "@/types/track";

const api = vi.hoisted(() => ({ updateAlbum: vi.fn(), upsertAlbumWithTracks: vi.fn() }));
vi.mock("@/services/internalApi/albums", () => api);
const album: Album = {
  release_id: "r",
  friend_id: 7,
  title: "Album",
  artist: "Artist",
  track_count: 1,
  effective_genres: [],
  effective_styles: ["Fusion"],
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}
beforeEach(() => {
  vi.resetAllMocks();
  useTrackStore.getState().clearTracks();
  useAlbumStore.getState().clearAlbums();
  useTrackStore.getState().setTracks([
    {
      ...sampleTrack,
      track_id: "owned",
      release_id: "r",
      friend_id: 7,
      album_styles: ["Old"],
      track_genres: [{ id: "s", name: "Salsa", slug: "salsa", parent_id: null, parent_name: null }],
    },
    { ...sampleTrack, track_id: "other", release_id: "r", friend_id: 8, album_styles: ["Other"] },
    {
      ...sampleTrack,
      track_id: "different",
      release_id: "different",
      friend_id: 7,
      album_styles: ["Different"],
    },
  ]);
  api.updateAlbum.mockResolvedValue({ success: true, album });
  api.upsertAlbumWithTracks.mockResolvedValue({ album, tracks: [] });
});
afterEach(cleanup);
function assertScopedUpdate() {
  expect(useAlbumStore.getState().getAlbum("r", 7)).toEqual(album);
  expect(useTrackStore.getState().getTrack("owned", 7)).toMatchObject({
    album_genres: [],
    album_styles: ["Fusion"],
    track_genres: [expect.objectContaining({ name: "Salsa" })],
  });
  expect(useTrackStore.getState().getTrack("other", 8)?.album_styles).toEqual(["Other"]);
  expect(useTrackStore.getState().getTrack("different", 7)?.album_styles).toEqual(["Different"]);
}
describe("album taxonomy mutation cache updates", () => {
  it("updates the owning store and invalidates affected search/facets after PATCH", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUpdateAlbumMutation(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        release_id: "r",
        friend_id: 7,
        genre_override_ids: [],
        style_override_ids: null,
      }),
    );
    assertScopedUpdate();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tracks"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["genres"] });
  });
  it("leaves taxonomy alone for an ordinary metadata PATCH", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUpdateAlbumMutation(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ release_id: "r", friend_id: 7, album_notes: "note" }),
    );
    expect(useTrackStore.getState().getTrack("owned", 7)?.album_styles).toEqual(["Old"]);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["genres"] });
  });
  it("applies style-only replacements and full edit responses without touching another friend", async () => {
    const { wrapper, invalidate } = setup();
    const patch = renderHook(() => useUpdateAlbumMutation(), { wrapper });
    await act(() =>
      patch.result.current.mutateAsync({ release_id: "r", friend_id: 7, style_override_ids: [] }),
    );
    assertScopedUpdate();
    const edit = renderHook(() => useUpdateAlbumWithTracksMutation(), { wrapper });
    await act(() =>
      edit.result.current.mutateAsync({
        release_id: "r",
        friend_id: 7,
        album: { title: "Album", artist: "Artist", style_override_ids: null },
        tracks: [],
      }),
    );
    assertScopedUpdate();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["genres"] });
  });
});
