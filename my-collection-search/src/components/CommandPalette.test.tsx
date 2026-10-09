// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { Track, Album } from "@/types/track";

// cmdk scrolls the highlighted item into view; jsdom has no layout engine.
Element.prototype.scrollIntoView ??= () => {};

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  track: vi.fn(),
  fetchGenreTree: vi.fn(),
  searchTracks: vi.fn(),
  searchAlbums: vi.fn(),
  getAlbumWithTracks: vi.fn(),
  replacePlaylist: vi.fn(),
  friend: { id: 1, username: "dj" } as { id: number; username: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/",
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
  useCommandPalette: () => ({ paletteOpen: true, setPaletteOpen: vi.fn() }),
}));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: mocks.fetchGenreTree }));
vi.mock("@/services/internalApi/tracks", () => ({ searchTracks: mocks.searchTracks }));
vi.mock("@/services/internalApi/albums", () => ({
  searchAlbums: mocks.searchAlbums,
  getAlbumWithTracks: mocks.getAlbumWithTracks,
}));
vi.mock("@/lib/analytics/client", () => ({ analytics: { track: mocks.track } }));

import CommandPalette from "./CommandPalette";

const node = (overrides: Partial<GenreTreeNode> & { name: string; slug: string }): GenreTreeNode => ({
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
  });

  it("shows a genre's open and search actions, and opens it on select", async () => {
    mocks.searchTracks.mockResolvedValue({ hits: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoe");

    expect(await screen.findByText("Shoegaze")).toBeTruthy();
    expect(screen.getAllByText(/Rock › Shoegaze · 12 tracks/).length).toBeGreaterThan(0);
    expect(screen.getByText("Search Tracks in Shoegaze")).toBeTruthy();
    expect(screen.getByText("Search Albums in Shoegaze")).toBeTruthy();

    await user.click(screen.getByText("Shoegaze"));
    expect(mocks.push).toHaveBeenCalledWith("/genres/shoegaze");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "open_genre" });
  });

  it("finds a genre by its alias", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoegazer");
    expect(await screen.findByText("Shoegaze")).toBeTruthy();
  });

  it("opens the genre's track search href", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoe");
    await screen.findByText("Shoegaze");

    await user.click(screen.getByText("Search Tracks in Shoegaze"));
    expect(mocks.push).toHaveBeenCalledWith("/?genre=shoegaze");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "search_genre_tracks" });
  });

  it("opens the genre's album search href", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "shoe");
    await screen.findByText("Shoegaze");

    await user.click(screen.getByText("Search Albums in Shoegaze"));
    expect(mocks.push).toHaveBeenCalledWith("/albums?genre=shoegaze");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "search_genre_albums" });
  });

  it("lists album matches and opens one", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    expect(await screen.findByText("Loveless")).toBeTruthy();

    await user.click(screen.getByText("Loveless"));
    expect(mocks.push).toHaveBeenCalledWith("/albums/r1?friend_id=1");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "open_album" });
  });

  it("plays an album by fetching and queuing its tracks", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockResolvedValue({ tracks: [track()] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.click(screen.getByText("Play: Loveless"));
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalledWith("r1", 1));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([track()], { autoplay: true, startIndex: 0 });
  });

  it("tells the user when an album has no tracks to play", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockResolvedValue({ tracks: [] });
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.click(screen.getByText("Play: Loveless"));
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalled());
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
  });

  it("reports an error when the album's tracks fail to load", async () => {
    mocks.searchAlbums.mockResolvedValue({ hits: [album()] });
    mocks.getAlbumWithTracks.mockRejectedValue(new Error("down"));
    const { user } = renderWithProviders(<CommandPalette />);

    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "loveless");
    await screen.findByText("Loveless");

    await user.click(screen.getByText("Play: Loveless"));
    await waitFor(() => expect(mocks.getAlbumWithTracks).toHaveBeenCalled());
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
  });

  it("offers to search everywhere, defaulting the track search to hybrid mode", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    const searchTracksEntry = await screen.findByText('Search tracks for "dusty cumbia"');
    await user.click(searchTracksEntry);
    expect(mocks.push).toHaveBeenCalledWith("/?q=dusty+cumbia&mode=hybrid");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "search_tracks_query" });
  });

  it("keeps the current search mode for the search-everywhere track link", async () => {
    mocks.searchParams = new URLSearchParams("mode=semantic");
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    await user.click(await screen.findByText('Search tracks for "dusty cumbia"'));
    expect(mocks.push).toHaveBeenCalledWith("/?q=dusty+cumbia&mode=semantic");
  });

  it("sends the search-everywhere album link to the albums page", async () => {
    const { user } = renderWithProviders(<CommandPalette />);
    await user.type(screen.getByPlaceholderText(/Search tracks, albums, genres/), "dusty cumbia");

    await user.click(await screen.findByText('Search albums for "dusty cumbia"'));
    expect(mocks.push).toHaveBeenCalledWith("/albums?q=dusty%20cumbia");
    expect(mocks.track).toHaveBeenCalledWith("command_palette_used", { command: "search_albums_query" });
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
      expect.not.objectContaining({ filter: expect.anything() })
    );
    expect(mocks.searchAlbums).toHaveBeenCalledWith(
      expect.not.objectContaining({ friend_id: expect.anything() })
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
      () => new Promise((resolve) => { resolveFirst = resolve; })
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
});
