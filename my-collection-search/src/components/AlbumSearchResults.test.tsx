// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  useAlbumsInfiniteQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => ({ push: vi.fn() }),
}));
const albumsInStore = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/hooks/useAlbum", () => ({
  useAlbumsByRefs: () => albumsInStore.list,
  useAlbum: () => undefined,
}));
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useAlbumsInfiniteQuery: mocks.useAlbumsInfiniteQuery,
  useUpdateAlbumMutation: () => ({ mutate: vi.fn() }),
}));

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
      expect.objectContaining({ friend_id: 6, genre: ["latin", "jazz"] }),
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
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1&similar_exclude=id-porro");
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(mocks.useAlbumsInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({ include_similar: true, similar_exclude: ["id-porro"] }),
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
      data: {
        pages: [{ hits: [], added_genres: [{ id: "id-porro", name: "Porro", slug: "porro" }] }],
      },
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: null,
    });
    const onAddedGenresChange = vi.fn();
    renderWithProviders(
      <AlbumSearchResults friendId={6} onAddedGenresChange={onAddedGenresChange} />,
    );

    await vi.waitFor(() =>
      expect(onAddedGenresChange).toHaveBeenCalledWith([
        { id: "id-porro", name: "Porro", slug: "porro" },
      ]),
    );
  });

  it("reports an empty list when nothing was added", async () => {
    const onAddedGenresChange = vi.fn();
    renderWithProviders(
      <AlbumSearchResults friendId={6} onAddedGenresChange={onAddedGenresChange} />,
    );
    await vi.waitFor(() => expect(onAddedGenresChange).toHaveBeenCalledWith([]));
  });

  it("reports nothing known yet while the first page loads (#899)", async () => {
    mocks.useAlbumsInfiniteQuery.mockReturnValue({
      data: undefined,
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: true,
      error: null,
    });
    const onAddedGenresChange = vi.fn();
    renderWithProviders(
      <AlbumSearchResults friendId={6} onAddedGenresChange={onAddedGenresChange} />,
    );
    await vi.waitFor(() => expect(onAddedGenresChange).toHaveBeenCalledWith(undefined));
  });
});

describe("AlbumSearchResults layouts (#730)", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    albumsInStore.list = [
      { release_id: "r1", friend_id: 6, title: "One", artist: "A", track_count: 3 },
    ];
    mocks.useAlbumsInfiniteQuery.mockReset().mockReturnValue({
      data: { pages: [{ hits: [], estimatedTotalHits: 1 }] },
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: null,
    });
  });

  it("lists cards by default, tagged with the active Missing filters", () => {
    mocks.searchParams = new URLSearchParams("missing_audio=1");
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(screen.getByTestId("album-card").textContent).toContain("No audio");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the count with the sort label, and changes the sort from it", async () => {
    mocks.searchParams = new URLSearchParams("sort=year:desc");
    const onSortChange = vi.fn();
    const { user } = renderWithProviders(
      <AlbumSearchResults friendId={6} onSortChange={onSortChange} />,
    );
    expect(screen.getByText("1 album")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sort: Newest Releases" }));
    await user.click(await screen.findByRole("menuitem", { name: "Title (A-Z)" }));
    expect(onSortChange).toHaveBeenCalledWith("title:asc");
  });

  it("has no sort label unless asked for one", () => {
    mocks.searchParams = new URLSearchParams();
    renderWithProviders(<AlbumSearchResults friendId={6} />);
    expect(screen.queryByRole("button", { name: /Sort/ })).toBeNull();
  });

  it("reports the total once loaded, and not while loading or failed", async () => {
    mocks.searchParams = new URLSearchParams();
    const onTotalChange = vi.fn();
    renderWithProviders(<AlbumSearchResults friendId={6} onTotalChange={onTotalChange} />);
    await waitFor(() => expect(onTotalChange).toHaveBeenCalledWith(1));

    const loading = vi.fn();
    mocks.useAlbumsInfiniteQuery.mockReturnValue({
      data: undefined,
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: true,
      error: null,
    });
    renderWithProviders(<AlbumSearchResults friendId={6} onTotalChange={loading} />);
    const failed = vi.fn();
    mocks.useAlbumsInfiniteQuery.mockReturnValue({
      data: undefined,
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: new Error("boom"),
    });
    renderWithProviders(<AlbumSearchResults friendId={6} onTotalChange={failed} />);
    expect(loading).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it("keeps the count and sort above an empty result", async () => {
    albumsInStore.list = [];
    mocks.useAlbumsInfiniteQuery.mockReturnValue({
      data: { pages: [{ hits: [], estimatedTotalHits: 0 }] },
      albumRefs: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      error: null,
    });
    mocks.searchParams = new URLSearchParams("q=zzz");
    renderWithProviders(<AlbumSearchResults friendId={6} onSortChange={vi.fn()} />);
    expect(screen.getByText("0 albums")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sort:/ })).toBeTruthy();
    expect(screen.getByText("No albums found.")).toBeTruthy();
  });

  it("lists a table in row layout", () => {
    mocks.searchParams = new URLSearchParams();
    renderWithProviders(<AlbumSearchResults friendId={6} layout="row" />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByTestId("album-row")).toBeTruthy();
  });
});
