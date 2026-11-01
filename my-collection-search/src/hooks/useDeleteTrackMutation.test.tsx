// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ softDeleteTrack: vi.fn() }));
vi.mock("@/services/internalApi/tracks", () => ({ softDeleteTrack: mocks.softDeleteTrack }));

import { useDeleteTrackMutation } from "./useDeleteTrackMutation";
import { useTrackStore, type TrackEntity } from "@/stores/trackStore";
import { queryKeys } from "@/lib/queryKeys";

const track = { track_id: "t1", friend_id: 7, release_id: "r1", title: "Song" } as TrackEntity;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, ...renderHook(() => useDeleteTrackMutation(), { wrapper }) };
}

beforeEach(() => {
  useTrackStore.getState().clearTracks();
  useTrackStore.getState().setTracks([track]);
  mocks.softDeleteTrack.mockReset();
});
afterEach(cleanup);

describe("useDeleteTrackMutation", () => {
  it("soft-deletes, evicts the track and invalidates every view that can hold it", async () => {
    mocks.softDeleteTrack.mockResolvedValue({ success: true });
    const { qc, invalidate, result } = setup();
    qc.setQueryData(queryKeys.trackById("t1", 7), track);

    await act(() => result.current.mutateAsync({ track_id: "t1", friend_id: 7, release_id: "r1" }));

    expect(mocks.softDeleteTrack).toHaveBeenCalledWith({ track_id: "t1", friend_id: 7 });
    expect(useTrackStore.getState().getTrack("t1", 7)).toBeUndefined();
    expect(qc.getQueryData(queryKeys.trackById("t1", 7))).toBeUndefined();
    const invalidated = invalidate.mock.calls.map(([f]) => f?.queryKey);
    expect(invalidated).toEqual(
      expect.arrayContaining([
        queryKeys.tracksRoot(),
        queryKeys.albumsRoot(),
        queryKeys.albumDetail("r1", 7),
        queryKeys.playlistRoot(),
        queryKeys.playlistTracksRoot(),
        queryKeys.genresRoot(),
        queryKeys.homeRoot(),
        queryKeys.playlists(),
      ]),
    );
  });

  it("skips the album detail key when the release is unknown", async () => {
    mocks.softDeleteTrack.mockResolvedValue({ success: true });
    const { invalidate, result } = setup();

    await act(() => result.current.mutateAsync({ track_id: "t1", friend_id: 7 }));

    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).not.toContainEqual(
      expect.arrayContaining(["album"]),
    );
  });

  it("leaves the store and caches alone when the delete fails", async () => {
    mocks.softDeleteTrack.mockRejectedValue(new Error("nope"));
    const { invalidate, result } = setup();

    await act(() => result.current.mutateAsync({ track_id: "t1", friend_id: 7 }).catch(() => {}));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(useTrackStore.getState().getTrack("t1", 7)).toBeDefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
