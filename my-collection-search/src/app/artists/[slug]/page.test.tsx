// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  slug: "los-mirlos",
  query: { data: undefined, error: null, refetch: vi.fn() } as {
    data: unknown;
    error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  },
  friend: { id: 6, username: "ana" } as { id: number; username: string } | null,
  setFriend: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  search: "",
  replacePlaylist: vi.fn(),
  playable: true,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: mocks.slug }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: mocks.friend, setFriend: mocks.setFriend }),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: mocks.replacePlaylist }),
}));
vi.mock("@/hooks/useArtistPageQuery", () => ({ useArtistPageQuery: () => mocks.query }));
vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: [
      { id: 6, username: "ana" },
      { id: 1, username: "me" },
    ],
  }),
}));
vi.mock("@/services/internalApi/settings", () => ({
  fetchDefaultLibrarySettings: async () => ({ friend_id: 1 }),
}));
vi.mock("@/stores/trackStore", () => ({
  useTrackStore: {
    getState: () => ({
      getTrack: (id: string) => ({
        track_id: id,
        friend_id: 6,
        local_audio_url: mocks.playable ? "/audio/x.mp3" : "",
      }),
    }),
  },
}));
vi.mock("@/hooks/useTrack", () => ({ useTrack: (id: string) => ({ track_id: id }) }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => <span /> }));
vi.mock("@/components/TrackResultStore", () => ({
  default: (props: { trackId: string; layout: string }) => (
    <div data-testid="track">
      {props.trackId} {props.layout}
    </div>
  ),
}));
vi.mock("@/components/AlbumResult", () => ({
  default: (props: { albumRef: { release_id: string } }) => (
    <div data-testid="album">{props.albumRef.release_id}</div>
  ),
}));
import ArtistPage, { sortAlbums } from "./page";

const album = (id: string, extra: Record<string, unknown> = {}) => ({
  release_id: id,
  friend_id: 6,
  title: `Title ${id}`,
  year: "1970",
  date_added: "2026-01-01",
  appears_on_tracks: 0,
  appears_on_positions: [],
  ...extra,
});
const page = (extra: Record<string, unknown> = {}) => ({
  artist: {
    id: 4,
    name: "Los Mirlos",
    sort_name: "Mirlos, Los",
    slug: "los-mirlos",
    discogs_artist_id: "77",
    is_placeholder: false,
  },
  aliases: ["Mirlos"],
  counts: { albums: 2, appears_on: 1, tracks: 3, spins: 5, year_min: 1970, year_max: 1985 },
  albums: [
    album("a1"),
    album("a2", { year: "1985" }),
    album("c1", { appears_on_tracks: 2, appears_on_positions: ["B3", "B4"] }),
  ],
  top_tracks: [{ track_id: "t1", friend_id: 6 }],
  top_tracks_by: "spins",
  genres: [{ id: "g", name: "Cumbia", slug: "cumbia", track_count: 3 }],
  collaborators: [{ id: 9, name: "Juaneco", slug: "juaneco", shared_credits: 2 }],
  ...extra,
});

describe("ArtistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(1280);
    mocks.query = { data: undefined, error: null, refetch: vi.fn() };
    mocks.friend = { id: 6, username: "ana" };
    mocks.playable = true;
    mocks.search = "";
  });

  it("shows a skeleton while loading", () => {
    renderWithProviders(<ArtistPage />);
    expect(screen.getByTestId("artist-page-loading")).toBeTruthy();
  });

  it("offers a retry when the page fails", async () => {
    mocks.query.error = new Error("boom");
    const { user } = renderWithProviders(<ArtistPage />);
    expect(screen.getByRole("alert").textContent).toContain("boom");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.query.refetch).toHaveBeenCalled();
  });

  it("shows the header, stats, albums, appearances, genres and collaborators", () => {
    mocks.query.data = page();
    renderWithProviders(<ArtistPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Los Mirlos");
    expect(screen.getByText("Also credited as Mirlos")).toBeTruthy();
    // No body row for Discogs; the header menu carries it.
    expect(screen.queryByRole("link", { name: "Discogs profile" })).toBeNull();
    const stats = screen.getByLabelText("Artist stats");
    expect(stats.textContent).toContain("1970–1985");
    const albums = screen.getByRole("region", { name: "Albums" });
    expect(
      within(albums)
        .getAllByTestId("album")
        .map((n) => n.textContent),
    ).toEqual(["a2", "a1"]);
    const appears = screen.getByRole("region", { name: "Appears on" });
    expect(appears.textContent).toContain("Appears on · 2 tracks · B3, B4");
    expect(screen.getByText(/by spins/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cumbia · 3" }).getAttribute("href")).toContain(
      "cumbia",
    );
    expect(screen.getByRole("link", { name: "Juaneco" }).getAttribute("href")).toBe(
      "/artists/juaneco",
    );
  });

  it("labels top tracks as from the albums when nothing was played, and singular appearances", () => {
    mocks.query.data = page({
      top_tracks_by: "albums",
      counts: { albums: 1, appears_on: 1, tracks: 1, spins: 0, year_min: 1970, year_max: 1970 },
      albums: [album("c1", { appears_on_tracks: 1, appears_on_positions: [""] })],
      genres: [],
      collaborators: [],
      aliases: [],
      artist: { ...page().artist, discogs_artist_id: null },
    });
    renderWithProviders(<ArtistPage />);
    expect(screen.getByText(/from the albums/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Albums" })).toBeNull();
    expect(screen.getByText("Appears on · 1 track")).toBeTruthy();
    expect(screen.queryByText("No genres yet.")).toBeNull();
    expect(screen.getByText("No collaborators credited.")).toBeTruthy();
    expect(screen.queryByText(/Also credited/)).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions", hidden: true })).toBeNull();
  });

  it("opens the Discogs profile from the header menu", async () => {
    mocks.query.data = page();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { user } = renderWithProviders(<ArtistPage />);
    await user.click(screen.getAllByRole("button", { name: "More actions", hidden: true })[0]);
    const items = await screen.findAllByRole("menuitem", { name: "View on Discogs", hidden: true });
    await user.click(items[0]);
    expect(open).toHaveBeenCalledWith(
      "https://www.discogs.com/artist/77",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("caps a big catalogue at 12 albums and 10 tracks until Show all", async () => {
    mocks.query.data = page({
      albums: Array.from({ length: 30 }, (_, i) => album(`a${i}`, { year: String(1960 + i) })),
      top_tracks: Array.from({ length: 25 }, (_, i) => ({ track_id: `t${i}`, friend_id: 6 })),
    });
    const { user } = renderWithProviders(<ArtistPage />);
    expect(screen.getAllByTestId("album")).toHaveLength(12);
    expect(screen.getAllByTestId("track")).toHaveLength(10);
    await user.click(screen.getByRole("button", { name: "Show all 30 albums" }));
    expect(screen.getAllByTestId("album")).toHaveLength(30);
    await user.click(screen.getByRole("button", { name: "Show all 25 tracks" }));
    expect(screen.getAllByTestId("track")).toHaveLength(25);
  });

  it("switches views through the URL and keeps albums newest first", async () => {
    mocks.query.data = page();
    const { user, rerender } = renderWithProviders(<ArtistPage />);
    expect(screen.queryByLabelText("Sort albums")).toBeNull();
    expect(within(screen.getByLabelText("Artist stats")).getByText("Cumbia · 3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "TRACKS" }));
    expect(mocks.push).toHaveBeenCalledWith(expect.stringContaining("?view=tracks"), {
      scroll: false,
    });
    mocks.search = "view=tracks";
    rerender(<ArtistPage />);
    expect(screen.getByRole("region", { name: "Top tracks" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Albums" })).toBeNull();
    mocks.search = "view=albums";
    rerender(<ArtistPage />);
    expect(screen.queryByRole("region", { name: "Top tracks" })).toBeNull();
    expect(screen.getByRole("region", { name: "Albums" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ALL" }));
    expect(mocks.push).toHaveBeenLastCalledWith(expect.not.stringContaining("view="), {
      scroll: false,
    });
  });

  it.each(["tracks", "albums"])("shows the full catalogue in the %s view", (view) => {
    mocks.search = `view=${view}`;
    mocks.query.data = page({
      albums: Array.from({ length: 15 }, (_, i) => album(`a${i}`)),
      top_tracks: Array.from({ length: 15 }, (_, i) => ({ track_id: `t${i}`, friend_id: 6 })),
    });
    renderWithProviders(<ArtistPage />);
    expect(screen.getAllByTestId(view === "tracks" ? "track" : "album")).toHaveLength(15);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("hides the switch without both kinds and omits an empty genre row", () => {
    mocks.query.data = page({ albums: [], genres: [] });
    renderWithProviders(<ArtistPage />);
    expect(screen.queryByRole("group", { name: "Artist content" })).toBeNull();
    expect(within(screen.getByLabelText("Artist stats")).queryByText("Genres")).toBeNull();
  });

  it("plays the playable top tracks, or says there are none", async () => {
    mocks.query.data = page();
    const { user } = renderWithProviders(<ArtistPage />);
    await user.click(screen.getAllByRole("button", { name: "Play all" })[0]);
    expect(mocks.replacePlaylist).toHaveBeenCalledWith(
      [expect.objectContaining({ track_id: "t1" })],
      { autoplay: true, startIndex: 0 },
    );
    mocks.playable = false;
    await user.click(screen.getAllByRole("button", { name: "Play all" })[0]);
    expect(screen.getByRole("alert").textContent).toContain("No playable tracks");
  });

  it("shows an empty state with a way to the viewer's own collection", async () => {
    mocks.query.data = page({
      albums: [],
      top_tracks: [],
      counts: { albums: 0, appears_on: 0, tracks: 0, spins: 0, year_min: null, year_max: null },
    });
    const { user } = renderWithProviders(<ArtistPage />);
    expect(screen.getByRole("status").textContent).toContain("Nothing by Los Mirlos in ana’s");
    expect(screen.getByRole("link", { name: "Search albums" }).getAttribute("href")).toContain(
      "/albums?q=Los%20Mirlos",
    );
    await user.click(await screen.findByRole("button", { name: "View in my collection" }));
    expect(mocks.setFriend).toHaveBeenCalledWith({ id: 1, username: "me" });
  });

  it("redirects a placeholder artist to the album search", () => {
    mocks.query.data = page({
      artist: { ...page().artist, name: "Various", is_placeholder: true },
    });
    renderWithProviders(<ArtistPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/albums?q=Various");
    expect(screen.getByRole("status").textContent).toContain("isn't a single artist");
  });

  it("replaces an old slug with the artist's current one", () => {
    mocks.slug = "artist-abc123";
    mocks.query.data = page();
    renderWithProviders(<ArtistPage />);
    expect(mocks.replace).toHaveBeenCalledWith("/artists/los-mirlos");
    mocks.slug = "los-mirlos";
  });

  it("does not redirect when the slug is current", () => {
    mocks.query.data = page();
    renderWithProviders(<ArtistPage />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("puts top tracks as cards on a 390px phone", () => {
    setViewportWidth(390);
    mocks.query.data = page();
    renderWithProviders(<ArtistPage />);
    expect(screen.getByTestId("track").textContent).toContain("card");
    expect(screen.queryByRole("button", { name: "Rows view" })).toBeNull();
  });
});

describe("sortAlbums", () => {
  it("does not mutate its input", () => {
    const input = [album("a"), album("b", { year: "2000" })];
    sortAlbums(input, "year");
    expect(input[0].release_id).toBe("a");
  });
});
