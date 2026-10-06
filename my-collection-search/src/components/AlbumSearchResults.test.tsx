// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useAlbumsInfiniteQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock("@/hooks/useAlbumsQuery", () => ({ useAlbumsInfiniteQuery: mocks.useAlbumsInfiniteQuery }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbumsByRefs: () => [] }));

import AlbumSearchResults from "./AlbumSearchResults";

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("AlbumSearchResults genre filter (#375)", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    mocks.useAlbumsInfiniteQuery.mockReset().mockReturnValue({
      data: { pages: [] },
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: null,
    });
  });

  it("searches by every genre in the URL", () => {
    mocks.searchParams = new URLSearchParams("genre=latin&genre=jazz");
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(mocks.useAlbumsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ friend_id: 6, genre: ["latin", "jazz"] })
    );
  });

  it("sends no genre without one", () => {
    mocks.searchParams = new URLSearchParams();
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(mocks.useAlbumsInfiniteQuery.mock.calls[0][0]).not.toHaveProperty("genre");
  });
});
