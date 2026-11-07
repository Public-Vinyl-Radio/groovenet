// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchArtistPage = vi.hoisted(() => vi.fn());
const setAlbums = vi.hoisted(() => vi.fn());
const setTracks = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/artists", () => ({ fetchArtistPage }));
vi.mock("@/stores/albumStore", () => ({ useAlbumStore: { getState: () => ({ setAlbums }) } }));
vi.mock("@/stores/trackStore", () => ({ useTrackStore: { getState: () => ({ setTracks }) } }));

import { useArtistPageQuery } from "../useArtistPageQuery";

function render(slug: string, friendId: number | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useArtistPageQuery(slug, friendId), { wrapper });
}

describe("useArtistPageQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchArtistPage.mockResolvedValue({
      artist: { slug: "los-mirlos" },
      albums: [
        {
          release_id: "r1",
          friend_id: 6,
          title: "T",
          appears_on_tracks: 2,
          appears_on_positions: ["A1"],
        },
      ],
      top_tracks: [{ track_id: "t1", friend_id: 6, title: "x" }],
    });
  });

  it("stores the entities and keeps only refs in the query data", async () => {
    const { result } = render("los-mirlos", 6);

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetchArtistPage).toHaveBeenCalledWith("los-mirlos", 6);
    expect(setAlbums).toHaveBeenCalledWith([expect.objectContaining({ release_id: "r1" })]);
    expect(setTracks).toHaveBeenCalledWith([expect.objectContaining({ track_id: "t1" })]);
    expect(result.current.data).toEqual({
      artist: { slug: "los-mirlos" },
      albums: [
        {
          release_id: "r1",
          friend_id: 6,
          title: "T",
          year: null,
          date_added: null,
          appears_on_tracks: 2,
          appears_on_positions: ["A1"],
        },
      ],
      top_tracks: [{ track_id: "t1", friend_id: 6 }],
    });
  });

  it("waits until the collection is known", () => {
    const { result } = render("los-mirlos", undefined);
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchArtistPage).not.toHaveBeenCalled();
  });
});
