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

describe("AlbumSearchResults include_similar (#485)", () => {
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

  it("sends include_similar and similar_exclude from the URL", () => {
    mocks.searchParams = new URLSearchParams(
      "genre=cumbia&similar=1&similar_exclude=id-porro"
    );
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(mocks.useAlbumsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ include_similar: true, similar_exclude: ["id-porro"] })
    );
  });

  it("sends neither without similar=1", () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia");
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    const arg = mocks.useAlbumsInfiniteQuery.mock.calls[0][0];
    expect(arg).not.toHaveProperty("include_similar");
    expect(arg).not.toHaveProperty("similar_exclude");
  });

  it("reports the genres the server added, up to the caller", async () => {
    mocks.useAlbumsInfiniteQuery.mockReturnValue({
      data: { pages: [{ hits: [], added_genres: [{ id: "id-porro", name: "Porro", slug: "porro" }] }] },
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: null,
    });
    const onAddedGenresChange = vi.fn();
    renderWithProviders(
      <AlbumSearchResults friendId={6} onAddedGenresChange={onAddedGenresChange} />
    );

    await vi.waitFor(() =>
      expect(onAddedGenresChange).toHaveBeenCalledWith([{ id: "id-porro", name: "Porro", slug: "porro" }])
    );
  });

  it("reports an empty list when nothing was added", async () => {
    const onAddedGenresChange = vi.fn();
    renderWithProviders(
      <AlbumSearchResults friendId={6} onAddedGenresChange={onAddedGenresChange} />
    );
    await vi.waitFor(() => expect(onAddedGenresChange).toHaveBeenCalledWith([]));
  });
});
