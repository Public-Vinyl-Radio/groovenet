// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";

const api = vi.hoisted(() => ({ fetchTrackById: vi.fn() }));
vi.mock("@/services/internalApi/tracks", () => api);

import { useTrackByIdQuery } from "./useTrackByIdQuery";

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const track: Track = {
  id: 1,
  track_id: "t1",
  friend_id: 6,
  title: "Terlingua",
  artist: "Artist",
  album: "LP-345",
  year: "2020",
  duration: "3:00",
  position: "A2",
  discogs_url: "",
  apple_music_url: "",
  hasVectors: true,
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useTrackStore.getState().clearTracks();
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("useTrackByIdQuery (#468)", () => {
  it("writes the fetched track to the store", async () => {
    api.fetchTrackById.mockResolvedValue(track);

    const { result } = renderHook(() => useTrackByIdQuery("t1", 6, true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(track));
    expect(useTrackStore.getState().getTrack("t1", 6)).toEqual(track);
  });

  it("replaces a stale partial store entry missing hasVectors with the fresh fetch", async () => {
    // Simulates a track seeded by album detail before #468, which left hasVectors out.
    const partial = { ...track };
    delete (partial as Partial<Track>).hasVectors;
    useTrackStore.getState().setTracks([partial]);
    expect("hasVectors" in (useTrackStore.getState().getTrack("t1", 6) ?? {})).toBe(false);

    api.fetchTrackById.mockResolvedValue(track);
    renderHook(() => useTrackByIdQuery("t1", 6, true), { wrapper });

    await waitFor(() => expect(useTrackStore.getState().getTrack("t1", 6)?.hasVectors).toBe(true));
  });
});
