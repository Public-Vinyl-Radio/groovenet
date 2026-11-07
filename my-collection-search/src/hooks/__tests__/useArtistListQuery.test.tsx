// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const listArtists = vi.hoisted(() => vi.fn());
vi.mock("@/services/internalApi/artists", () => ({ listArtists }));

import { ARTIST_PAGE_SIZE, useArtistListQuery, useArtistSuggestions } from "../useArtistListQuery";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const artist = (id: number) => ({
  id,
  name: `Artist ${id}`,
  sort_name: `Artist ${id}`,
  slug: `artist-${id}`,
  discogs_artist_id: null,
  is_placeholder: false,
  album_count: 1,
  track_count: 0,
});

describe("useArtistListQuery (#709)", () => {
  beforeEach(() => {
    listArtists.mockReset();
  });

  it("pages through one collection's artists by letter", async () => {
    listArtists
      .mockResolvedValueOnce({ items: [artist(1)], total: 2, limit: 1, offset: 0, query: "" })
      .mockResolvedValueOnce({ items: [artist(2)], total: 2, limit: 1, offset: 1, query: "" });
    const { result } = renderHook(() => useArtistListQuery({ q: "", letter: "A", friendId: 6 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.artists).toHaveLength(1));
    expect(result.current.total).toBe(2);
    expect(result.current.hasNextPage).toBe(true);
    expect(listArtists).toHaveBeenCalledWith({
      q: "",
      letter: "A",
      friend_id: 6,
      limit: ARTIST_PAGE_SIZE,
      offset: 0,
    });

    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.artists.map((a) => a.id)).toEqual([1, 2]));
    expect(listArtists).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("waits for a friend, and while disabled", () => {
    const { result } = renderHook(() => useArtistListQuery({ q: "", friendId: undefined }), {
      wrapper,
    });
    renderHook(() => useArtistListQuery({ q: "", friendId: 6, enabled: false }), { wrapper });
    expect(listArtists).not.toHaveBeenCalled();
    expect(result.current.artists).toEqual([]);
    expect(result.current.total).toBeUndefined();
  });
});

describe("useArtistSuggestions (#709)", () => {
  beforeEach(() => {
    listArtists.mockReset();
  });

  it("searches the trimmed words, a few at a time", async () => {
    listArtists.mockResolvedValue({ items: [artist(1)], total: 1, limit: 8, offset: 0, query: "" });
    const { result } = renderHook(() => useArtistSuggestions(" mir ", 6), { wrapper });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(listArtists).toHaveBeenCalledWith({ q: "mir", friend_id: 6, limit: 8 });
  });

  it("asks nothing for no words", () => {
    renderHook(() => useArtistSuggestions("  ", 6), { wrapper });
    expect(listArtists).not.toHaveBeenCalled();
  });
});
