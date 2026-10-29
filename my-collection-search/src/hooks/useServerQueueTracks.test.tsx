// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { player } from "@/test/serverPlayerFixtures";
import { useTrackStore } from "@/stores/trackStore";
import { fetchTracksByIds } from "@/services/internalApi/tracks";
import type { Track } from "@/types/track";

vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds: vi.fn() }));
import { placeholderTrack, useServerQueueTracks } from "@/hooks/useServerQueueTracks";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const entries = player().state.queue;

beforeEach(() => {
  vi.clearAllMocks();
  useTrackStore.getState().clearTracks();
});

describe("useServerQueueTracks", () => {
  it("shows the server's title and artist until each unique track loads, then the full row", async () => {
    const full = {
      ...placeholderTrack(entries[0]!),
      album: "Album",
      duration_seconds: 242,
      album_thumbnail: "art.jpg",
    } as Track;
    vi.mocked(fetchTracksByIds).mockResolvedValue([full]);
    const { result } = renderHook(() => useServerQueueTracks(entries), { wrapper });
    expect(result.current.map((t) => t.title)).toEqual(["Track", "Track"]);
    expect(result.current[0]!.album_thumbnail).toBeUndefined();
    await waitFor(() => expect(result.current[0]!.album_thumbnail).toBe("art.jpg"));
    expect(fetchTracksByIds).toHaveBeenCalledWith([
      { track_id: "same-track", friend_id: 1 },
      { track_id: "same-track", friend_id: 2 },
    ]);
    // The second friend's copy is still its own row.
    expect(result.current[1]!.friend_id).toBe(2);
    expect(result.current[1]!.album_thumbnail).toBeUndefined();
  });

  it("asks for nothing it already has, or for an empty queue", () => {
    useTrackStore.getState().setTracks(entries.map(placeholderTrack));
    const { result } = renderHook(() => useServerQueueTracks(entries), { wrapper });
    renderHook(() => useServerQueueTracks([]), { wrapper });
    expect(result.current).toHaveLength(2);
    expect(fetchTracksByIds).not.toHaveBeenCalled();
  });
});
