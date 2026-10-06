// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  useSearchResults: vi.fn(),
  onQueryChange: vi.fn(),
  track: vi.fn(),
  query: "",
  useTrackGenreFacets: vi.fn(),
  fetchGenreTree: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" }, isHydrated: true }),
}));
vi.mock("@/hooks/useSearchResults", () => ({ useSearchResults: mocks.useSearchResults }));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: mocks.track } }));
vi.mock("@/hooks/useTrackGenreFacets", () => ({ useTrackGenreFacets: mocks.useTrackGenreFacets }));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: mocks.fetchGenreTree }));
// The result list and its rows have their own tests; here only the controls matter.
vi.mock("@/components/TrackResultStore", () => ({ default: () => null }));
vi.mock("@/components/TrackTableViewWithLoader", () => ({ default: () => null }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/TrackSelectionBar", () => ({ default: () => null }));

import SearchResults from "./SearchResults";

/** The desktop input: jsdom renders both layouts and only the mobile one is accessible. */
const searchInput = () => screen.getAllByRole("textbox", { hidden: true })[0] as HTMLInputElement;
const lastSearchMode = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].searchMode;
const lastGenres = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].genres;
const lastFacets = () => mocks.useTrackGenreFacets.mock.calls.at(-1)?.[0];
const genreNode = (id: string, name: string, parent_id: string | null = null) => ({
  id,
  name,
  slug: name.toLowerCase(),
  parent_id,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.query = "";
  mocks.useTrackGenreFacets.mockReturnValue({ counts: new Map([["salsa", 3]]) });
  mocks.fetchGenreTree.mockResolvedValue([
    { ...genreNode("latin", "Latin"), children: [genreNode("cumbia", "Cumbia", "latin"), genreNode("salsa", "Salsa", "latin")] },
  ]);
  mocks.useSearchResults.mockImplementation(() => ({
    query: mocks.query,
    onQueryChange: mocks.onQueryChange,
    estimatedResults: 0,
    trackInfo: [],
    playlistCounts: {},
    hasMore: false,
    loadMore: vi.fn(),
    initialLoading: false,
    loadingMore: false,
  }));
});

describe("SearchResults search mode", () => {
  it("starts on keyword search, with no mode in the URL", () => {
    renderWithProviders(<SearchResults />);

    expect(lastSearchMode()).toBe("lexical");
    expect(searchInput().placeholder).toBe("Search");
  });

  it("reads the mode from the URL", () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    renderWithProviders(<SearchResults />);
    expect(lastSearchMode()).toBe("semantic");
    expect(searchInput().placeholder).toMatch(/describe a sound/i);
  });

  it("falls back to keyword for an unknown mode in the URL", () => {
    mocks.searchParams = new URLSearchParams("mode=vibes");
    renderWithProviders(<SearchResults />);
    expect(lastSearchMode()).toBe("lexical");
  });

  it("switches mode from the toggle and records it in the URL", async () => {
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getAllByText("Hybrid")[0]);

    await waitFor(() => expect(lastSearchMode()).toBe("hybrid"));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?mode=hybrid");
  });

  it("drops the mode from the URL on returning to keyword", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic&q=cumbia");
    mocks.query = "cumbia";
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getAllByText("Keyword")[0]);

    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?q=cumbia"));
  });

  it("reports the mode with each executed query", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    const { user } = renderWithProviders(<SearchResults />);

    await user.type(searchInput(), "brass");

    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith(
        "search_query_executed",
        expect.objectContaining({ query_length: 5, search_mode: "semantic" })
      )
    );
  });
});

describe("SearchResults genre filter (#375)", () => {
  it("reads genres from the URL, searches by them and shows them as chips", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia");
    renderWithProviders(<SearchResults />);

    expect(lastGenres()).toEqual(["cumbia"]);
    expect(await screen.findByRole("button", { name: /Cumbia/ })).toBeTruthy();
    expect(screen.getByText(/1 filter active/)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("adds a picked genre and records it in the URL", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    await waitFor(() => expect(mocks.fetchGenreTree).toHaveBeenCalled());

    await user.click(screen.getByRole("combobox", { name: "Filter by genre" }));
    await user.click(await screen.findByRole("option", { name: /Salsa/ }));

    await waitFor(() => expect(lastGenres()).toEqual(["salsa"]));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?genre=salsa");
  });

  it("removes a genre from its chip, and Clear all drops every genre", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&genre=salsa&missingAudio=1");
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(await screen.findByRole("button", { name: /Cumbia/ }));
    await waitFor(() => expect(lastGenres()).toEqual(["salsa"]));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1&genre=salsa");

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(lastGenres()).toEqual([]));
  });

  it("counts genres for keyword search over the same filters, and not otherwise", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    expect(lastFacets()).toEqual({ q: "", filter: "friend_id = 1", enabled: true });

    await user.click(screen.getAllByText("Semantic")[0]);
    await waitFor(() => expect(lastFacets().enabled).toBe(false));
  });

  it("still toggles the other chips beside genres", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    await user.click(screen.getByRole("button", { name: "Missing audio" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1"));
  });

  it("starts with no genres when there are no search params", () => {
    mocks.searchParams = null as unknown as URLSearchParams;
    renderWithProviders(<SearchResults />);
    expect(lastGenres()).toEqual([]);
  });
});
