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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => "/",
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj" } }),
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
});
