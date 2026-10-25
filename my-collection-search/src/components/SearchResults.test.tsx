// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  useSearchResults: vi.fn(),
  onQueryChange: vi.fn(),
  setQuery: vi.fn(),
  track: vi.fn(),
  query: "",
  useTrackGenreFacets: vi.fn(),
  fetchGenreTree: vi.fn(),
  useTrack: vi.fn(),
  analyzeTrackAsync: vi.fn(),
  toastCreate: vi.fn(),
  loadMore: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
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
vi.mock("@/hooks/useTrack", () => ({ useTrack: mocks.useTrack }));
vi.mock("@/services/internalApi/tracks", () => ({ analyzeTrackAsync: mocks.analyzeTrackAsync }));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toastCreate } }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
// Each row/card renders enough to assert on layout + selection; the actual
// track-card markup has its own tests in TrackResult.test.tsx.
vi.mock("@/components/TrackResultStore", () => ({
  default: ({
    trackId,
    layout,
    isSelected,
    onToggleSelect,
  }: {
    trackId: string;
    layout?: string;
    isSelected?: boolean;
    onToggleSelect?: () => void;
  }) => (
    <div data-testid={`track-${trackId}`} data-layout={layout} data-selected={String(!!isSelected)}>
      {trackId}
      {onToggleSelect && (
        <button aria-label={`Select ${trackId}`} onClick={onToggleSelect}>
          select
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/components/TrackSelectionBar", () => ({
  default: ({
    selectedCount,
    onSelectAll,
    onClear,
    onEnrich,
    onDownloadAudio,
  }: {
    selectedCount: number;
    onSelectAll: () => void;
    onClear: () => void;
    onEnrich: () => void;
    onDownloadAudio: () => void;
  }) =>
    selectedCount === 0 ? null : (
      <div>
        <span>{selectedCount} selected</span>
        <button onClick={onSelectAll}>Select all</button>
        <button onClick={onClear}>Clear selection</button>
        <button onClick={onEnrich}>Enrich</button>
        <button onClick={onDownloadAudio}>Download audio</button>
      </div>
    ),
}));

import SearchResults from "./SearchResults";
import { useTrackStore } from "@/stores/trackStore";

let nextTrackId = 1;
const trackFixture = (trackId: string, overrides: Partial<Track> = {}): Track => ({
  id: nextTrackId++,
  track_id: trackId,
  friend_id: 1,
  title: trackId,
  artist: "A",
  album: "B",
  year: "2020",
  duration: "3:00",
  position: "A1",
  discogs_url: "",
  apple_music_url: "",
  ...overrides,
});

/** Populates both lookup paths a result relies on: the row/card mock's `useTrack`
 * and the real zustand store `handleDownloadAudio` reads from. */
function seedTracks(tracks: Track[]) {
  mocks.useTrack.mockImplementation((trackId: string, friendId: number) =>
    tracks.find((t) => t.track_id === trackId && t.friend_id === friendId)
  );
  tracks.forEach((t) => useTrackStore.getState().setTrack(t));
}

class CapturingIntersectionObserver {
  static instances: CapturingIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    CapturingIntersectionObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

/** The "Select tracks" toggle is duplicated for mobile/desktop with the same label. */
const selectTracksButton = () =>
  screen.getAllByRole("button", { name: "Select tracks", hidden: true })[0];

/** The desktop input: jsdom renders both layouts and only the mobile one is accessible. */
const searchInput = () => screen.getAllByRole("textbox")[0] as HTMLInputElement;
const lastSearchMode = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].searchMode;
const lastGenres = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].genres;
const lastAttributes = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].attributes;
const lastFilter = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].filter;
const lastIncludeSimilar = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].includeSimilar;
const lastSimilarExclude = () => mocks.useSearchResults.mock.calls.at(-1)?.[0].similarExclude;
const lastFacets = () => mocks.useTrackGenreFacets.mock.calls.at(-1)?.[0];
/** The phone's Search options modal, opened from the header kebab. */
const openFilters = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
  await user.click(screen.getByRole("button", { name: /^Tracks actions/ }));
  await user.click(await screen.findByRole("menuitem", { name: /^Search options/ }));
  return screen.findByRole("dialog", { name: "Search options" });
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
  setViewportWidth(1280);
  localStorage.clear();
  useTrackStore.getState().clearTracks();
  CapturingIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", CapturingIntersectionObserver);
  mocks.useTrack.mockReturnValue(undefined);
  mocks.searchParams = new URLSearchParams();
  mocks.query = "";
  mocks.useTrackGenreFacets.mockReturnValue({ counts: new Map([["salsa", 3]]) });
  mocks.fetchGenreTree.mockResolvedValue([
    { ...genreNode("latin", "Latin"), children: [genreNode("cumbia", "Cumbia", "latin"), genreNode("salsa", "Salsa", "latin")] },
  ]);
  mocks.useSearchResults.mockImplementation(() => ({
    query: mocks.query,
    onQueryChange: mocks.onQueryChange,
    setQuery: mocks.setQuery,
    estimatedResults: 0,
    trackInfo: [],
    playlistCounts: {},
    hasMore: false,
    loadMore: mocks.loadMore,
    initialLoading: false,
    loadingMore: false,
    addedGenres: [],
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

describe("SearchResults simplified toolbar and header menu (#751)", () => {
  it("drops the mode switch and filter button from the phone toolbar", () => {
    setViewportWidth(375);
    renderWithProviders(<SearchResults />);
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Hybrid" })).toBeNull();
  });

  it("shows no count on the kebab without filters", () => {
    renderWithProviders(<SearchResults />);
    expect(screen.getByRole("button", { name: "Tracks actions" })).toBeTruthy();
  });

  it("turns select mode on and off from the kebab", async () => {
    seedTracks([trackFixture("t1")]);
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 1, trackInfo: [{ trackId: "t1", friendId: 1 }],
      playlistCounts: {}, hasMore: false, loadMore: mocks.loadMore,
      initialLoading: false, loadingMore: false, addedGenres: [],
    }));
    const { user } = renderWithProviders(<SearchResults />);
    expect(screen.queryByRole("button", { name: "Select t1" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tracks actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Select tracks" }));
    expect(await screen.findByRole("button", { name: "Select t1" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tracks actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Stop selecting" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Select t1" })).toBeNull());
  });

  it("opens Search options with the active count, switches mode and shows the hint", async () => {
    mocks.searchParams = new URLSearchParams("key=A+minor");
    const { user } = renderWithProviders(<SearchResults />);
    await user.click(screen.getByRole("button", { name: /^Tracks actions/ }));
    expect(await screen.findByRole("menuitem", { name: "Search options (1)" })).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Search options (1)" }));
    const dialog = await screen.findByRole("dialog", { name: "Search options" });

    expect(within(dialog).getByTestId("search-mode-hint").textContent).toMatch(/words you type/);
    await user.click(within(dialog).getByText("Semantic"));
    await waitFor(() => expect(lastSearchMode()).toBe("semantic"));
    expect(within(dialog).getByTestId("search-mode-hint").textContent).toMatch(/sound you describe/);
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

describe("SearchResults include_similar (#485)", () => {
  it("reads similar=1 from the URL and shows the toggle checked", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    renderWithProviders(<SearchResults />);

    expect(lastIncludeSimilar()).toBe(true);
    expect(
      (screen.getAllByRole("checkbox", { name: "Include similar", hidden: true })[0] as HTMLInputElement)
        .checked
    ).toBe(true);
  });

  it("hides the toggle without an active genre", () => {
    renderWithProviders(<SearchResults />);
    expect(screen.queryByRole("checkbox", { name: "Include similar", hidden: true })).toBeNull();
  });

  it("turns the toggle on and records it in the URL", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia");
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getAllByRole("checkbox", { name: "Include similar", hidden: true })[0]);

    await waitFor(() => expect(lastIncludeSimilar()).toBe(true));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?genre=cumbia&similar=1");
  });

  it("names the genres include_similar added as removable chips", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1");
    mocks.useSearchResults.mockImplementation(() => ({
      query: mocks.query,
      onQueryChange: mocks.onQueryChange,
      setQuery: mocks.setQuery,
      estimatedResults: 0,
      trackInfo: [],
      playlistCounts: {},
      hasMore: false,
      loadMore: vi.fn(),
      initialLoading: false,
      loadingMore: false,
      addedGenres: [{ id: "id-porro", name: "Porro", slug: "porro" }],
    }));
    const { user } = renderWithProviders(<SearchResults />);

    const chip = await screen.findByRole("button", { name: /Porro/ });
    await user.click(chip);

    await waitFor(() => expect(lastSimilarExclude()).toEqual(["id-porro"]));
    expect(mocks.replace).toHaveBeenLastCalledWith("/?similar=1&genre=cumbia&similar_exclude=id-porro");
  });

  it("reads similar_exclude from the URL", () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1&similar_exclude=id-porro");
    renderWithProviders(<SearchResults />);
    expect(lastSimilarExclude()).toEqual(["id-porro"]);
  });

  it("clears the toggle and exclusions from Clear all", async () => {
    mocks.searchParams = new URLSearchParams("genre=cumbia&similar=1&similar_exclude=id-porro");
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(await screen.findByRole("button", { name: "Clear all" }));

    await waitFor(() => expect(lastIncludeSimilar()).toBe(false));
    expect(lastSimilarExclude()).toEqual([]);
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
    expect(screen.getByRole("button", { name: "Tracks actions, 2 filters on" })).toBeTruthy();
  });

  it("turns a check on from the filter sheet, and off from its chip", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    expect(screen.queryByRole("button", { name: /Missing audio/ })).toBeNull();

    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Audio" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1"));
    await user.click(screen.getByRole("button", { name: /^Show/ }));

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

  it("resets everything from the modal's Reset", async () => {
    mocks.searchParams = new URLSearchParams("key=A+minor&missingAudio=1");
    const { user } = renderWithProviders(<SearchResults />);

    const sheet = await openFilters(user);
    await user.click(within(sheet).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(lastAttributes()).toEqual({}));
    expect(lastFilter()).toEqual(["friend_id = 1"]);
  });
});

describe("SearchResults following a navigation (#376)", () => {
  it("replaces the search with the URL a genre badge navigated to", async () => {
    mocks.searchParams = new URLSearchParams("q=dub&mode=semantic&missingAudio=1&star_rating=4&genre=salsa");
    const { rerender } = renderWithProviders(<SearchResults />);
    mocks.replace.mockClear();

    mocks.searchParams = new URLSearchParams("genre=cumbia");
    rerender(<SearchResults />);

    await waitFor(() => expect(lastGenres()).toEqual(["cumbia"]));
    expect(lastAttributes()).toEqual({});
    expect(lastFilter()).toEqual(["friend_id = 1"]);
    expect(lastSearchMode()).toBe("lexical");
    expect(mocks.setQuery).toHaveBeenCalledWith("");
    expect(screen.getByText(/1 filter active/)).toBeTruthy();
    // Nothing writes the old search back over the badge's URL.
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("takes the search mode and query from the URL it navigated to", async () => {
    const { rerender } = renderWithProviders(<SearchResults />);

    mocks.searchParams = new URLSearchParams("q=dub&mode=semantic&genre=cumbia");
    rerender(<SearchResults />);

    await waitFor(() => expect(lastSearchMode()).toBe("semantic"));
    expect(lastGenres()).toEqual(["cumbia"]);
    expect(mocks.setQuery).toHaveBeenCalledWith("dub");
  });

  it("doesn't mistake its own write landing for a navigation", async () => {
    const { user, rerender } = renderWithProviders(<SearchResults />);
    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Audio" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1"));

    mocks.searchParams = new URLSearchParams("missingAudio=1");
    rerender(<SearchResults />);

    expect(mocks.setQuery).not.toHaveBeenCalled();
    expect(screen.getByText(/1 filter active/)).toBeTruthy();
  });

  it("keeps a change made while its last write is still on the way", async () => {
    const { user } = renderWithProviders(<SearchResults />);
    await openFilters(user);
    await user.click(screen.getByRole("button", { name: "Audio" }));
    // The URL hasn't caught up yet when the next filter is set.
    await user.click(screen.getByRole("button", { name: "4 stars and up" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenLastCalledWith("/?missingAudio=1&star_rating=4"));
    expect(lastAttributes()).toEqual({ star_rating: 4 });
    expect(mocks.setQuery).not.toHaveBeenCalled();
  });
});

describe("SearchResults loading states", () => {
  it("shows a skeleton while results are loading initially", () => {
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 0, trackInfo: [], playlistCounts: {}, hasMore: false,
      loadMore: mocks.loadMore, initialLoading: true, loadingMore: false, addedGenres: [],
    }));
    renderWithProviders(<SearchResults />);

    expect(screen.queryByText(/results found/)).toBeNull();
  });

  it("shows a spinner while loading more", () => {
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 1, trackInfo: [{ trackId: "t1", friendId: 1 }], playlistCounts: {}, hasMore: true,
      loadMore: mocks.loadMore, initialLoading: false, loadingMore: true, addedGenres: [],
    }));
    renderWithProviders(<SearchResults />);

    expect(document.querySelector(".chakra-spinner")).toBeTruthy();
  });

  it("loads more once the bottom sentinel intersects", () => {
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 1, trackInfo: [{ trackId: "t1", friendId: 1 }], playlistCounts: {}, hasMore: true,
      loadMore: mocks.loadMore, initialLoading: false, loadingMore: false, addedGenres: [],
    }));
    renderWithProviders(<SearchResults />);

    const observer = CapturingIntersectionObserver.instances.at(-1);
    observer?.callback([{ isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);

    expect(mocks.loadMore).toHaveBeenCalledOnce();
  });
});

describe("SearchResults rows/cards view", () => {
  function withResults() {
    seedTracks([trackFixture("t1"), trackFixture("t2")]);
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 2,
      trackInfo: [{ trackId: "t1", friendId: 1 }, { trackId: "t2", friendId: 1 }],
      playlistCounts: {}, hasMore: false, loadMore: mocks.loadMore,
      initialLoading: false, loadingMore: false, addedGenres: [],
    }));
  }

  it("renders rows by default, with the column header", () => {
    withResults();
    renderWithProviders(<SearchResults />);

    expect(screen.getByText("Track")).toBeTruthy();
    expect(screen.getByTestId("track-t1").dataset.layout).toBe("row");
    expect(screen.getByTestId("track-t2").dataset.layout).toBe("row");
  });

  it("switches to cards from the toggle and remembers it on reload", async () => {
    withResults();
    const { user, unmount } = renderWithProviders(<SearchResults />);

    await user.click(screen.getByRole("button", { name: "Cards view", hidden: true }));
    expect(screen.getByTestId("track-t1").dataset.layout).toBe("card");
    expect(localStorage.getItem("searchViewMode")).toBe("card");

    unmount();
    renderWithProviders(<SearchResults />);
    expect(screen.getByTestId("track-t1").dataset.layout).toBe("card");
  });

  it("switches back to rows from the toggle", async () => {
    withResults();
    localStorage.setItem("searchViewMode", "card");
    const { user } = renderWithProviders(<SearchResults />);
    expect(screen.getByTestId("track-t1").dataset.layout).toBe("card");

    await user.click(screen.getByRole("button", { name: "Rows view", hidden: true }));

    expect(screen.getByTestId("track-t1").dataset.layout).toBe("row");
    expect(localStorage.getItem("searchViewMode")).toBe("row");
  });

  it("always renders cards on phones, even with rows saved", () => {
    localStorage.setItem("searchViewMode", "row");
    setViewportWidth(375);
    withResults();
    renderWithProviders(<SearchResults />);

    expect(screen.getByTestId("track-t1").dataset.layout).toBe("card");
  });
});

describe("SearchResults selection and bulk actions", () => {
  function withSelectableResults() {
    seedTracks([
      trackFixture("t1", { apple_music_url: "https://music.apple.com/x" }),
      trackFixture("t2", { local_audio_url: "t2.m4a" }),
    ]);
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 2,
      trackInfo: [{ trackId: "t1", friendId: 1 }, { trackId: "t2", friendId: 1 }],
      playlistCounts: {}, hasMore: false, loadMore: mocks.loadMore,
      initialLoading: false, loadingMore: false, addedGenres: [],
    }));
  }

  it("selects a track, then selects all and clears", async () => {
    withSelectableResults();
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(selectTracksButton());
    await user.click(screen.getByRole("button", { name: "Select t1" }));
    expect(screen.getByText("1 selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("2 selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("selects a track from its checkbox in cards view too", async () => {
    withSelectableResults();
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(screen.getByRole("button", { name: "Cards view", hidden: true }));
    await user.click(selectTracksButton());
    await user.click(screen.getByRole("button", { name: "Select t1" }));

    expect(screen.getByTestId("track-t1").dataset.selected).toBe("true");
  });

  it("queues selected tracks for enrichment and navigates to /enrich", async () => {
    withSelectableResults();
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(selectTracksButton());
    await user.click(screen.getByRole("button", { name: "Select t1" }));
    await user.click(screen.getByRole("button", { name: "Enrich" }));

    expect(mocks.push).toHaveBeenCalledWith("/enrich");
  });

  it("downloads audio only for selected tracks that have a streaming link but no local audio", async () => {
    mocks.analyzeTrackAsync.mockResolvedValue({ jobId: "job1" });
    withSelectableResults();
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(selectTracksButton());
    await user.click(screen.getByRole("button", { name: "Select t1" }));
    await user.click(screen.getByRole("button", { name: "Select t2" }));
    await user.click(screen.getByRole("button", { name: "Download audio" }));

    await waitFor(() => expect(mocks.analyzeTrackAsync).toHaveBeenCalledTimes(1));
    expect(mocks.analyzeTrackAsync).toHaveBeenCalledWith(expect.objectContaining({ track_id: "t1" }));
    expect(mocks.toastCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "1 track queued for download" })
    );
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });

  it("reports a failed download but still queues the rest", async () => {
    mocks.analyzeTrackAsync.mockRejectedValueOnce(new Error("nope"));
    seedTracks([
      trackFixture("t1", { apple_music_url: "https://music.apple.com/x" }),
      trackFixture("t3", { apple_music_url: "https://music.apple.com/y" }),
    ]);
    mocks.useSearchResults.mockImplementation(() => ({
      query: "", onQueryChange: mocks.onQueryChange, setQuery: mocks.setQuery,
      estimatedResults: 2,
      trackInfo: [{ trackId: "t1", friendId: 1 }, { trackId: "t3", friendId: 1 }],
      playlistCounts: {}, hasMore: false, loadMore: mocks.loadMore,
      initialLoading: false, loadingMore: false, addedGenres: [],
    }));
    const { user } = renderWithProviders(<SearchResults />);

    await user.click(selectTracksButton());
    await user.click(screen.getByRole("button", { name: "Select t1" }));
    await user.click(screen.getByRole("button", { name: "Select t3" }));
    await user.click(screen.getByRole("button", { name: "Download audio" }));

    await waitFor(() =>
      expect(mocks.toastCreate).toHaveBeenCalledWith(
        expect.objectContaining({ title: "1 track queued for download" })
      )
    );
  });
});
