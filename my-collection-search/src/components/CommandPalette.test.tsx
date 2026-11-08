// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { Track, Album } from "@/types/track";

// cmdk scrolls the highlighted item into view; jsdom has no layout engine.
Element.prototype.scrollIntoView ??= () => {};

const mocks = vi.hoisted(() => ({
  scope: undefined as import("@/providers/CommandPaletteProvider").PaletteScope | undefined,
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  track: vi.fn(),
  fetchGenreTree: vi.fn(),
  searchTracks: vi.fn(),
  searchAlbums: vi.fn(),
  getAlbumWithTracks: vi.fn(),
  listArtists: vi.fn(),
  replacePlaylist: vi.fn(),
  setPaletteOpen: vi.fn(),
  friend: { id: 1, username: "dj" } as { id: number; username: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/tracks",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: mocks.friend }),
}));
vi.mock("@/hooks/usePlaylistsQuery", () => ({
  usePlaylistsQuery: () => ({ playlists: [] }),
}));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({
    playlist: [],
    playlistLength: 0,
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    playNext: vi.fn(),
    playPrev: vi.fn(),
    clearQueue: vi.fn(),
    replacePlaylist: mocks.replacePlaylist,
  }),
}));
vi.mock("@/providers/CommandPaletteProvider", () => ({
  useCommandPalette: () => ({
    paletteOpen: true,
    setPaletteOpen: mocks.setPaletteOpen,
    scope: mocks.scope,
  }),
}));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: mocks.fetchGenreTree }));
vi.mock("@/services/internalApi/tracks", () => ({ searchTracks: mocks.searchTracks }));
vi.mock("@/services/internalApi/albums", () => ({
  searchAlbums: mocks.searchAlbums,
  getAlbumWithTracks: mocks.getAlbumWithTracks,
}));
vi.mock("@/services/internalApi/artists", () => ({ listArtists: mocks.listArtists }));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: mocks.track } }));

import CommandPalette from "./CommandPalette";

const node = (
  overrides: Partial<GenreTreeNode> & { name: string; slug: string },
): GenreTreeNode => ({
  id: overrides.slug,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children: [],
  ...overrides,
});

const GENRE_TREE: GenreTreeNode[] = [
  node({
    name: "Rock",
    slug: "rock",
    children: [
      node({
        id: "shoegaze",
        name: "Shoegaze",
        slug: "shoegaze",
        parent_id: "rock",
        track_count: 12,
        aliases: ["shoegazer"],
      }),
    ],
  }),
  node({ name: "Jazz", slug: "jazz", track_count: 7 }),
];

const track = (overrides: Partial<Track> = {}): Track =>
  ({
    track_id: "t1",
    friend_id: 1,
    title: "Only Shallow",
    artist: "My Bloody Valentine",
    album: "Loveless",
    ...overrides,
  }) as Track;

const album = (overrides: Partial<Album> = {}): Album =>
  ({
    release_id: "r1",
    friend_id: 1,
    title: "Loveless",
    artist: "My Bloody Valentine",
    track_count: 11,
    ...overrides,
  }) as Album;

describe("CommandPalette (#472)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.friend = { id: 1, username: "dj" };
    mocks.fetchGenreTree.mockResolvedValue(GENRE_TREE);
    mocks.searchTracks.mockResolvedValue({ hits: [] });
    mocks.searchAlbums.mockResolvedValue({ hits: [] });
    mocks.listArtists.mockResolvedValue({ items: [] });
  });

  it("shows one row per genre, and opens the genre page on select", async () => {
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoe");

    expect(await screen.findByText("Shoegaze")).toBeTruthy();
    expect(screen.getAllByText(/Rock › Shoegaze · 12 tracks/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Search (Tracks|Albums) in Shoegaze/)).toBeNull();

    await user.click(screen.getByText("Shoegaze"));
    expect(mocks.push).toHaveBeenCalledWith("/genres/shoegaze");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "open_genre",
    });
  });

  it("finds a genre by its alias", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoegazer");
    expect(await screen.findByText("Shoegaze")).toBeTruthy();
  });

  it("lists album matches and opens one", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    expect(await screen.findByText("Loveless")).toBeTruthy();

    await user.click(screen.getByText("Loveless"));
    expect(mocks.push).toHaveBeenCalledWith("/albums/r1?friend_id=1");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "open_album",
    });
  });

  it("plays an album by fetching and queuing its tracks", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockResolvedValue({ tracks: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.hover(screen.getByText("Loveless"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalledWith("r1", 1));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([track()], {
      autoplay: true,
      startIndex: 0,
    });
  });

  it("lists a track once and plays it on Ctrl+Enter", async () => {
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shallow");
    await screen.findByText("Only Shallow");
    expect(screen.getAllByText("Only Shallow")).toHaveLength(1);
    expect(screen.queryByText(/^Play: /)).toBeNull();
    expect(screen.getByText("play")).toBeTruthy();

    await user.hover(screen.getByText("Only Shallow"));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([track()], {
      autoplay: true,
      startIndex: 0,
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "play_track",
    });
  });

  it("lists Search first and opens a track on select", async () => {
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText(/Search tracks, albums, genres/);
    await user.type(input, "shallow");
    await screen.findByText("Only Shallow");

    const items = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(items[0]).toBe('Search tracks for "shallow"');
    expect(items[1]).toBe('Search albums for "shallow"');

    await user.click(screen.getByText("Only Shallow"));
    expect(mocks.push).toHaveBeenCalledWith("/tracks/t1?friend_id=1");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "open_track",
    });
  });

  it("tells the user when an album has no tracks to play", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockResolvedValue({ tracks: [] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.hover(screen.getByText("Loveless"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalled());
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
  });

  it("reports an error when the album's tracks fail to load", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.hover(screen.getByText("Loveless"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalled());
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
  });

  it("offers to search everywhere, defaulting the track search to hybrid mode", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    const searchTracksEntry = await screen.findByText('Search tracks for "dusty cumbia"');
    await user.click(searchTracksEntry);
    expect(mocks.push).toHaveBeenCalledWith("/tracks?q=dusty+cumbia&mode=hybrid");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "search_tracks_query",
    });
  });

  it("keeps the current search mode for the search-everywhere track link", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    await user.click(await screen.findByText('Search tracks for "dusty cumbia"'));
    expect(mocks.push).toHaveBeenCalledWith("/tracks?q=dusty+cumbia&mode=semantic");
  });

  it("sends the search-everywhere album link to the albums page", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    await user.click(await screen.findByText('Search albums for "dusty cumbia"'));
    expect(mocks.push).toHaveBeenCalledWith("/albums?q=dusty%20cumbia");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "search_albums_query",
    });
  });

  it("shows a top-level genre's meta line without a breadcrumb", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "jazz");
    await screen.findByText("Jazz");
    expect(screen.getAllByText("Open Genre · Jazz · 7 tracks").length).toBeGreaterThan(0);
  });

  it("clears stale track results once the query is cleared", async () => {
    // The Tracks group (unlike Genres/Albums) isn't gated on the query being
    // non-empty, so this only passes if the debounced search actually resets
    // trackHits — not just because the query went blank.
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText(/Search tracks, albums, genres/);

    await user.type(input, "only shallow");
    await screen.findByText("Only Shallow");

    await user.clear(input);
    await waitFor(() => expect(screen.queryByText("Only Shallow")).toBeNull());
  });

  it("searches without a friend filter when no friend is selected", async () => {
    mocks.friend = null;
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    expect(mocks.searchTracks).toHaveBeenCalledWith(
      expect.not.objectContaining({ filter: expect.anything() }),
    );
    expect(mocks.searchAlbums).toHaveBeenCalledWith(
      expect.not.objectContaining({ friend_id: expect.anything() }),
    );
  });

  it("falls back to empty results when the track search fails", async () => {
    mocks.searchTracks.mockRejectedValue(new Error("down"));
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    expect(await screen.findByText("Loveless")).toBeTruthy();
  });

  it("ignores a track search that resolves after the query has already changed", async () => {
    let resolveFirst: ((value: { hits: Track[] }) => void) | undefined;
    mocks.searchTracks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mocks.searchAlbums.mockResolvedValue({ hits: [] });
    const { user } = renderWithProviders(<CommandPalette />);
    const input = screen.getByPlaceholderText(/Search tracks, albums, genres/);

    await user.type(input, "first");
    await waitFor(() => expect(mocks.searchTracks).toHaveBeenCalledTimes(1));

    mocks.searchTracks.mockResolvedValue({ hits: [] });
    await user.clear(input);
    await user.type(input, "second");
    await waitFor(() => expect(mocks.searchTracks).toHaveBeenCalledTimes(2));

    // The first request's debounce window has already been torn down, so its
    // late resolution must not resurrect a stale hit.
    resolveFirst?.({ hits: [track()] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Only Shallow")).toBeNull();
  });

  it("falls back to empty results when the album search fails", async () => {
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    mocks.searchAlbums.mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "only shallow");
    expect(await screen.findByText("Only Shallow")).toBeTruthy();
    expect(screen.queryByText("Loveless")).toBeNull();
  });

  it("lists Home and Tracks as navigation entries", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.click(await screen.findByText("Home"));
    expect(mocks.push).toHaveBeenCalledWith("/");
  });
});

describe("CommandPalette shortcuts (#1140)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchTracks.mockResolvedValue({ hits: [] });
    mocks.searchAlbums.mockResolvedValue({ hits: [] });
    mocks.listArtists.mockResolvedValue({ items: [] });
    mocks.fetchGenreTree.mockResolvedValue([]);
  });

  it("opens from inside a text field on Cmd+K and Ctrl+K", () => {
    renderWithProviders(
      <>
        <input aria-label="page search" />
        <CommandPalette />
      </>,
    );
    const field = screen.getByLabelText("page search");
    field.focus();
    fireEvent.keyDown(field, { key: "k", metaKey: true });
    fireEvent.keyDown(field, { key: "k", ctrlKey: true });
    expect(mocks.setPaletteOpen).toHaveBeenCalledTimes(2);
  });

  it("still lets [ and ] type in a field", () => {
    renderWithProviders(
      <>
        <input aria-label="page search" />
        <CommandPalette />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("page search"), { key: "]" });
    expect(mocks.setPaletteOpen).not.toHaveBeenCalled();
  });
});

describe("CommandPalette artists (#709)", () => {
  const meridian = {
    id: 9,
    name: "Meridian Brothers",
    sort_name: "Meridian Brothers",
    slug: "meridian-brothers",
    discogs_artist_id: null,
    is_placeholder: false,
    album_count: 2,
    track_count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mocks.friend = { id: 1, username: "dj" };
    mocks.fetchGenreTree.mockResolvedValue([]);
    mocks.searchTracks.mockResolvedValue({ hits: [] });
    mocks.searchAlbums.mockResolvedValue({ hits: [] });
    mocks.listArtists.mockResolvedValue({ items: [meridian] });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("finds artists in this collection and opens one", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "meridian");

    expect(await screen.findByText("Meridian Brothers", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText("Open Artist · 2 albums · 1 track")).toBeTruthy();
    await waitFor(
      () =>
        expect(mocks.listArtists).toHaveBeenCalledWith({ q: "meridian", limit: 5, friend_id: 1 }),
      { timeout: 5000 },
    );

    await user.click(screen.getByText("Meridian Brothers"));
    expect(mocks.push).toHaveBeenCalledWith("/artists/meridian-brothers");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "open_artist",
    });
  });

  it("searches tracks by the artist", async () => {
    mocks.listArtists.mockResolvedValue({
      items: [{ ...meridian, album_count: 0, track_count: 0 }],
    });
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "meridian");

    expect(await screen.findByText("Open Artist")).toBeTruthy();
    await user.click(screen.getByText("Tracks by Meridian Brothers"));
    expect(mocks.push).toHaveBeenCalledWith("/tracks?artist=meridian-brothers");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      scope: "global",
      command: "filter_tracks_by_artist",
    });
  });

  it("shows no artists when their search fails", async () => {
    mocks.listArtists.mockRejectedValue(new Error("down"));
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "meridian");
    expect(await screen.findByText("Loveless")).toBeTruthy();
    expect(screen.queryByText("Tracks by Meridian Brothers")).toBeNull();
  });

  it("asks for every collection's artists without a friend", async () => {
    mocks.friend = null;
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "meridian");
    await screen.findByText("Meridian Brothers", {}, { timeout: 5000 });
    await waitFor(
      () =>
        expect(mocks.listArtists).toHaveBeenCalledWith({
          q: "meridian",
          limit: 5,
          friend_id: undefined,
        }),
      { timeout: 5000 },
    );
  });

  it("lists Artists under Navigation", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "Artists");
    await user.click(await screen.findByText("/artists"));
    expect(mocks.push).toHaveBeenCalledWith("/artists");
  });
});

describe("page scopes (#1141)", () => {
  beforeEach(() => {
    mocks.scope = undefined;
  });
  it("shows a scope chip and runs its search on Enter, above global results", async () => {
    const onSearch = vi.fn();
    mocks.scope = { id: "tracks", label: "Tracks", onSearch };
    const { user } = renderWithProviders(<CommandPalette />);
    expect(screen.getByText("Tracks ›")).toBeTruthy();
    await user.type(screen.getByRole("combobox"), "dusty");
    await waitFor(() =>
      expect(screen.getAllByRole("option")[0].textContent).toBe('Search Tracks for "dusty"'),
    );
    await user.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledWith("dusty");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      command: "scoped_search",
      scope: "tracks",
    });
    expect(mocks.setPaletteOpen).toHaveBeenCalledWith(false);
  });
  it("removes the scope only on Backspace in an empty input, then searches globally", async () => {
    const onSearch = vi.fn();
    mocks.scope = { id: "albums", label: "Albums", onSearch };
    const { user } = renderWithProviders(<CommandPalette />);
    const input = screen.getByRole("combobox");
    await user.type(input, "a");
    await user.keyboard("{Backspace}");
    expect(screen.getByText("Albums ›")).toBeTruthy();
    await user.keyboard("{Backspace}");
    expect(screen.queryByText("Albums ›")).toBeNull();
    await user.type(input, "dusty");
    await user.keyboard("{Enter}");
    expect(onSearch).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/tracks?q=dusty&mode=hybrid");
  });
  it("dispatches page actions and skips disabled ones", async () => {
    const onSelect = vi.fn();
    mocks.scope = {
      id: "track",
      label: "Track",
      actions: [
        { id: "play_track", label: "Play this track", onSelect },
        { id: "add_track_to_playlist", label: "Disabled action", onSelect, disabled: true },
      ],
    };
    const { user } = renderWithProviders(<CommandPalette />);
    await user.click(screen.getByText("Disabled action"));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByText("Play this track"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", {
      command: "play_track",
      scope: "track",
    });
  });
  it("Esc still closes a scoped palette", async () => {
    mocks.scope = { id: "genres", label: "Genres", onSearch: vi.fn() };
    const { user } = renderWithProviders(<CommandPalette />);
    await user.keyboard("{Escape}");
    expect(mocks.setPaletteOpen).toHaveBeenCalledWith(false);
  });
});
