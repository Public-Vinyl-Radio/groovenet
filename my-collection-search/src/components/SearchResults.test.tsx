// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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
const lastAttributes = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].attributes;
const lastFilter = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].filter;
const lastFacets = () => mocks.useTrackGenreFacets.mock.calls.at(-1)?.[0];
/** The phone filter sheet: jsdom renders the phone layout, so it's the one in reach. */
const openFilters = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
  await user.click(screen.getByRole("button", { name: /^Filters/ }));
  return screen.findByRole("dialog", { name: "Filters" });
};
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

    await openFilters(user);
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
    expect(lastFacets()).toEqual({ q: "", filter: "friend_id = 1", attributes: {}, enabled: true });

    await user.click(screen.getAllByText("Semantic")[0]);
    await waitFor(() => expect(lastFacets().enabled).toBe(false));
  });


  it("starts with no genres when there are no search params", () => {
    mocks.searchParams = null as unknown as URLSearchParams;
    renderWithProviders(<SearchResults />);
    expect(lastGenres()).toEqual([]);
  });
});

describe("SearchResults missing and attribute filters (#447)", () => {
  it("still applies old missing*=1 links, as chips", async () => {
    mocks.searchParams = new URLSearchParams("missingYouTube=1&missingAudio=1");
    renderWithProviders(<SearchResults />);

    await waitFor(() =>
      expect(lastFilter()).toEqual(["local_audio_url IS NULL", "youtube_url IS NULL", "friend_id = 1"])
    );
    expect(screen.getByRole("button", { name: /Missing audio/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /No YouTube/ })).toBeTruthy();
    expect(screen.getByText(/2 filters active/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters, 2 on" })).toBeTruthy();
  });

  it("turns a check on from the filter sheet, and off from its chip", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    expect(screen.queryByRole("button", { name: /Missing audio/ })).toBeNull();

    await openFilters(user);
    await user.click(screen.getByRole("checkbox", { name: "Audio" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1"));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(await screen.findByRole("button", { name: /Missing audio/ }));
    await waitFor(() => expect(lastFilter()).toEqual(["friend_id = 1"]));
  });

  it("reads BPM, key and rating from the URL, searches and counts by them, and shows chips", async () => {
    mocks.searchParams = new URLSearchParams("bpm_min=120&bpm_max=126&key=A+minor&star_rating=4");
    renderWithProviders(<SearchResults />);

    const attributes = { bpm_min: 120, bpm_max: 126, key: "A minor", star_rating: 4 };
    expect(lastAttributes()).toEqual(attributes);
    expect(lastFacets().attributes).toEqual(attributes);
    for (const label of ["120–126 BPM", "8A · A minor", "★4+"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getByText(/3 filters active/)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("removes an attribute from its chip, and Clear all drops everything", async () => {
    mocks.searchParams = new URLSearchParams("key=A+minor&star_rating=4&missingAudio=1&genre=salsa");
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getByRole("button", { name: /A minor/ }));
    await waitFor(() => expect(lastAttributes()).toEqual({ star_rating: 4 }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?star_rating=4&missingAudio=1&genre=salsa");

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(lastAttributes()).toEqual({}));
    expect(lastGenres()).toEqual([]);
    expect(lastFilter()).toEqual(["friend_id = 1"]);
    expect(mocks.replace).toHaveBeenLastCalledWith("/");
  });

  it("sets a minimum rating from the filter sheet and records it in the URL", async () => {
    const { user } = renderWithProviders(<SearchResults />);

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "4 stars and up" }));

    await waitFor(() => expect(lastAttributes()).toEqual({ star_rating: 4 }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?star_rating=4");
  });

  it("clears everything from the sheet's Clear all", async () => {
    mocks.searchParams = new URLSearchParams("key=A+minor&missingAudio=1");
    const { user } = renderWithProviders(<SearchResults />);

    const sheet = await openFilters(user);
    await user.click(within(sheet).getByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(lastAttributes()).toEqual({}));
    expect(lastFilter()).toEqual(["friend_id = 1"]);
  });
});
