// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  slug: "psychedelic%20cumbia",
  query: { data: undefined, error: null, refetch: vi.fn() } as {
    data: unknown;
    error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  },
  friend: { id: 6 } as { id: number } | null,
  useGenrePageQuery: vi.fn(),
  useGenreResults: vi.fn(),
  play: vi.fn(),
  results: {
    data: { pages: [{ refs: [{ id: "r1", friend_id: 6 }] }] },
    isPending: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    error: null as Error | null,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  playback: { busy: false, problem: null as string | null },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ slug: mocks.slug }) }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useGenrePageQuery", () => ({
  useGenrePageQuery: (...args: unknown[]) => {
    mocks.useGenrePageQuery(...args);
    return mocks.query;
  },
}));
vi.mock("@/hooks/useGenreResults", () => ({
  useGenreResults: (...args: unknown[]) => {
    mocks.useGenreResults(...args);
    return mocks.results;
  },
}));
vi.mock("@/hooks/useGenrePlayback", () => ({
  useGenrePlayback: () => ({ ...mocks.playback, play: mocks.play }),
}));
vi.mock("@/hooks/useTrack", () => ({
  useTrack: (id: string) => (id === "untracked" ? undefined : { track_id: id }),
}));
vi.mock("@/components/TrackActionsMenu", () => ({
  default: (props: { track: { track_id: string } }) => (
    <span data-testid="track-menu">{props.track.track_id}</span>
  ),
}));
vi.mock("@/components/TrackResultStore", () => ({
  default: (props: { trackId: string; layout: string; buttons?: React.ReactNode[] }) => (
    <div data-testid="track-row">
      {props.trackId} {props.layout}
      {props.buttons}
    </div>
  ),
}));
const observers = vi.hoisted(() => ({
  callbacks: [] as ((entries: { isIntersecting: boolean }[]) => void)[],
}));
vi.mock("@/components/AlbumResult", () => ({
  default: (props: { albumRef: { release_id: string }; layout: string }) => (
    <div data-testid="album-row">
      {props.albumRef.release_id} {props.layout}
    </div>
  ),
}));
import GenrePage from "./page";
class FakeObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    observers.callbacks.push(callback);
  }
  observe() {}
  disconnect() {}
}
// jsdom renders both header widths: the labelled desktop button, and on phones
// the Play all key and a kebab holding Shuffle.
const desktopButton = (name: string) =>
  within(screen.getByTestId("page-header-desktop-actions")).getByRole("button", {
    name,
    hidden: true,
  }) as HTMLButtonElement;
const scrollToEnd = () => observers.callbacks.at(-1)?.([{ isIntersecting: true }]);
const ref = (id: string, name: string, track_count: number) => ({
  id,
  name,
  slug: name.toLowerCase(),
  track_count,
});
const fullPage = {
  genre: {
    id: "g",
    name: "Psychedelic Cumbia",
    slug: "psychedelic-cumbia",
    parent_id: "c",
    source: "custom",
    aliases: ["chicha psicodelica", "A very long alias ".repeat(30)],
  },
  ancestors: [
    { id: "l", name: "Latin", slug: "latin" },
    { id: "c", name: "Cumbia", slug: "cumbia" },
  ],
  children: [ref("s", "Selva", 4)],
  related: [ref("ch", "Chicha", 12)],
  counts: { tracks: 20, albums: 3, tracks_total: 24, albums_total: 9 },
  stats: {
    bpm_min: 90.5,
    bpm_max: 128,
    year: 2026,
    added_this_year: 5,
    playable_tracks: 20,
    bpm_histogram: [
      { min: 90, max: 100, count: 3 },
      { min: 120, max: 130, count: 1 },
    ],
  },
  // Samples must never be used as the full results.
  top_tracks: [{ track_id: "SAMPLE" }],
  top_albums: [{ release_id: "SAMPLE" }],
};

describe("genre detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.slug = "psychedelic%20cumbia";
    mocks.query = { data: undefined, error: null, refetch: vi.fn() };
    mocks.friend = { id: 6 };
    mocks.results = {
      data: { pages: [{ refs: [{ id: "r1", friend_id: 6 }] }] },
      isPending: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      error: null,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
    mocks.playback = { busy: false, problem: null };
    setViewportWidth(1280);
    observers.callbacks = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  it("loads the decoded slug for the collection and waits without one", () => {
    const { rerender } = renderWithProviders(<GenrePage />);
    expect(mocks.useGenrePageQuery).toHaveBeenCalledWith("psychedelic cumbia", 6);
    expect(screen.getByTestId("genre-page-loading")).toBeTruthy();
    mocks.friend = null;
    rerender(<GenrePage />);
    expect(mocks.useGenrePageQuery).toHaveBeenCalledWith("psychedelic cumbia", undefined);
  });
  it("offers retry and a way back for errors", async () => {
    mocks.query.error = new Error("Unknown genre");
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByRole("alert").textContent).toContain("Unknown genre");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "All genres" }).getAttribute("href")).toBe("/genres");
  });
  it("shows hierarchy, full stats, cover results and linked subgenres/relatives", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.queryByText(/Also matches/)).toBeNull();
    expect(screen.queryByText(/chicha psicodelica/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(
      getComputedStyle(screen.getByRole("heading", { name: "Psychedelic Cumbia" })).fontSize,
    ).toBe("20px");
    expect(screen.getByRole("link", { name: "Cumbia", hidden: true }).getAttribute("href")).toBe(
      "/genres/cumbia",
    );
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId("page-header-meta").textContent).toBe("24 tracks · 9 albums");
    expect(screen.getByText("90.5–128")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Added this year").parentElement?.title).toContain("date_added");
    expect(screen.getByTestId("album-row").textContent).toBe("r1 cover");
    expect(screen.queryByText("SAMPLE")).toBeNull();
    expect(screen.queryByTestId("track-row")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Subgenres" })).getByRole("link", {
        name: /Selva/,
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Related genres" }))
        .getByRole("link", { name: /Chicha/ })
        .getAttribute("href"),
    ).toBe("/genres/chicha");
    expect(screen.getByRole("img", { name: /90–100 BPM: 3 tracks/ })).toBeTruthy();
  });
  it("opens on Tracks, with the ⋯ menu on every row", () => {
    mocks.query.data = fullPage;
    renderWithProviders(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 6, "tracks", 24);
    expect(screen.getByRole("button", { name: "Tracks [24]" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByTestId("track-row").textContent).toBe("r1 rowr1");
    expect(screen.getByTestId("track-menu").textContent).toBe("r1");
    expect(screen.queryByRole("region", { name: "Subgenres" })).toBeNull();
  });
  it("shows a row without a menu until its track is in the store", () => {
    mocks.query.data = fullPage;
    mocks.results.data.pages = [{ refs: [{ id: "untracked", friend_id: 6 }] }];
    renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("track-row").textContent).toBe("untracked row");
    expect(screen.queryByTestId("track-menu")).toBeNull();
  });
  it("loads more on scroll for both views, with no button", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
    observers.callbacks.at(-1)?.([{ isIntersecting: false }]);
    expect(mocks.results.fetchNextPage).not.toHaveBeenCalled();
    scrollToEnd();
    expect(mocks.results.fetchNextPage).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    scrollToEnd();
    expect(mocks.results.fetchNextPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });
  it("does not load while a page is fetching, at the end, or after an error", () => {
    mocks.query.data = fullPage;
    mocks.results.isFetchingNextPage = true;
    const { rerender } = renderWithProviders(<GenrePage />);
    scrollToEnd();
    expect(mocks.results.fetchNextPage).not.toHaveBeenCalled();
    mocks.results.isFetchingNextPage = false;
    mocks.results.hasNextPage = false;
    rerender(<GenrePage />);
    expect(screen.queryByTestId("genre-results-sentinel")).toBeNull();
    mocks.results.hasNextPage = true;
    mocks.results.error = new Error("Offline");
    rerender(<GenrePage />);
    expect(screen.queryByTestId("genre-results-sentinel")).toBeNull();
  });
  it("calls both playback actions and switches to Albums", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("track-row")).toBeTruthy();
    await user.click(desktopButton("Play all"));
    expect(mocks.play).toHaveBeenCalledWith(false);
    await user.click(desktopButton("Shuffle"));
    expect(mocks.play).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(screen.getByTestId("album-row")).toBeTruthy();
  });
  it("covers a leaf with no results, playable tracks, BPM or relatives", async () => {
    mocks.query.data = {
      ...fullPage,
      genre: { ...fullPage.genre, source: "discogs", aliases: [] },
      children: [],
      related: [],
      stats: {
        ...fullPage.stats,
        bpm_min: null,
        bpm_max: null,
        playable_tracks: 0,
        bpm_histogram: [],
      },
    };
    mocks.results.data.pages = [{ refs: [] }];
    mocks.results.hasNextPage = false;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByText("No tracks in this genre yet.")).toBeTruthy();
    expect(screen.getByText("No BPM data for this genre yet.")).toBeTruthy();
    expect(screen.getByText("No related genres in the collection yet.")).toBeTruthy();
    expect(screen.queryByText("Custom")).toBeNull();
    expect(desktopButton("Play all").disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(screen.getByText("No albums in this genre yet.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Subgenres" })).toBeNull();
  });
  it("covers loading, busy playback and playback failures", () => {
    mocks.query.data = fullPage;
    mocks.results.isPending = true;
    mocks.playback = { busy: true, problem: "Playback failed" };
    renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("genre-results-loading")).toBeTruthy();
    expect(desktopButton("Shuffle").disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Playback failed");
  });
  it("retries a failed initial results query and a failed next page", async () => {
    mocks.query.data = fullPage;
    mocks.results.error = new Error("Offline");
    mocks.results.isFetchNextPageError = true;
    const { user, rerender } = renderWithProviders(<GenrePage />);
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.results.fetchNextPage).toHaveBeenCalledOnce();
    Object.assign(mocks.results, { data: undefined, isFetchNextPageError: false });
    rerender(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.results.refetch).toHaveBeenCalledOnce();
  });
  it("resets the view on collection changes", async () => {
    mocks.query.data = fullPage;
    const { user, rerender } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 6, "albums", 24);
    mocks.friend = { id: 7 };
    rerender(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 7, "tracks", 24);
  });
  it.each([0, 1, 2, 3, 4])(
    "uses the full album total at the thin boundary (%i albums)",
    async (total) => {
      mocks.query.data = {
        ...fullPage,
        counts: { ...fullPage.counts, albums: 0, albums_total: total },
      };
      mocks.results.data.pages = [
        { refs: Array.from({ length: total }, (_, i) => ({ id: `r${i}`, friend_id: 6 })) },
      ];
      mocks.results.hasNextPage = false;
      const { user } = renderWithProviders(<GenrePage />);
      // The thin-genre handling only shows on Albums.
      expect(screen.queryByRole("heading", { name: "Build this crate" })).toBeNull();
      await user.click(screen.getByRole("button", { name: /^Albums \[/ }));
      expect(screen.queryByRole("heading", { name: "Build this crate" }) !== null).toBe(total < 4);
      expect(screen.queryByRole("region", { name: "Weekly wantlist picks" }) !== null).toBe(
        total < 4,
      );
      expect(
        screen.getByRole("region", { name: total < 4 ? "Neighbouring crates" : "Related genres" }),
      ).toBeTruthy();
      expect(screen.queryAllByTestId("album-row")).toHaveLength(total);
      expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(total < 4 ? 4 : 0);
      for (const slot of screen.queryAllByTestId("crate-empty-slot")) {
        expect(slot.getAttribute("aria-hidden")).toBe("true");
        expect(slot.tabIndex).toBe(-1);
        expect(getComputedStyle(slot).borderStyle).toBe("dashed");
      }
    },
  );
  it("does not infer thinness from direct counts, loaded pages or previews", async () => {
    mocks.query.data = { ...fullPage, counts: { ...fullPage.counts, albums: 1, albums_total: 4 } };
    const { user } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [4]" }));
    expect(screen.queryByText("Build this crate")).toBeNull();
    expect(screen.queryByText("Weekly wantlist picks")).toBeNull();
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(0);
    expect(screen.getByTestId("genre-results-sentinel")).toBeTruthy();
  });
  it("keeps thin-state navigation, playback and Tracks working", async () => {
    mocks.query.data = { ...fullPage, counts: { ...fullPage.counts, albums_total: 1 } };
    mocks.results.hasNextPage = false;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("track-row")).toBeTruthy();
    expect(screen.queryByText("Build this crate")).toBeNull();
    expect(screen.getByRole("region", { name: "Neighbouring crates" })).toBeTruthy();
    await user.click(desktopButton("Play all"));
    await user.click(desktopButton("Shuffle"));
    expect(mocks.play.mock.calls).toEqual([[false], [true]]);
    await user.click(screen.getByRole("button", { name: "Albums [1]" }));
    expect(screen.getByRole("heading", { name: "Build this crate" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Subgenres" })).toBeTruthy();
    expect(screen.getByText(/Picks arrive with the recommender/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Chicha/ }).getAttribute("href")).toBe(
      "/genres/chicha",
    );
    expect(screen.getByTestId("album-row")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tracks [24]" }));
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(0);
    expect(screen.queryByText("Build this crate")).toBeNull();
  });
  it("withholds empty slots during loading, errors and unfinished pagination", async () => {
    mocks.query.data = { ...fullPage, counts: { ...fullPage.counts, albums_total: 1 } };
    const { user, rerender } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [1]" }));
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(0);
    mocks.results.hasNextPage = false;
    mocks.results.isPending = true;
    rerender(<GenrePage />);
    expect(screen.getByTestId("genre-results-loading")).toBeTruthy();
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(0);
    mocks.results.isPending = false;
    mocks.results.error = new Error("Offline");
    rerender(<GenrePage />);
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(0);
    mocks.results.error = null;
    rerender(<GenrePage />);
    expect(screen.queryAllByTestId("crate-empty-slot")).toHaveLength(4);
  });
  it("recalculates thin state and resets the view for friend and genre changes", async () => {
    mocks.query.data = fullPage;
    const { user, rerender } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    mocks.friend = { id: 7 };
    mocks.query.data = {
      ...fullPage,
      genre: { ...fullPage.genre, name: "Very long genre ".repeat(20) },
      children: [],
      counts: { ...fullPage.counts, albums_total: 0 },
    };
    mocks.results.data.pages = [{ refs: [] }];
    mocks.results.hasNextPage = false;
    rerender(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 7, "tracks", 24);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Very long genre");
    await user.click(screen.getByRole("button", { name: "Albums [0]" }));
    expect(screen.getByText("Build this crate")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Subgenres" })).toBeNull();
    mocks.slug = "salsa";
    mocks.query.data = { ...fullPage, genre: { ...fullPage.genre, slug: "salsa" } };
    rerender(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("salsa", 7, "tracks", 24);
    expect(screen.queryByText("Build this crate")).toBeNull();
  });
  const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ref(`${prefix}${i}`, `${prefix} ${i + 1}`, 100 - i));
  it("caps subgenres at 10, expands in place, and collapses back to the heading", async () => {
    mocks.query.data = { ...fullPage, children: many("Sub", 12) };
    const { user } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    const section = () => screen.getByRole("region", { name: "Subgenres" });
    expect(within(section()).getAllByRole("link")).toHaveLength(10);
    expect(within(section()).queryByRole("link", { name: /Sub 11/ })).toBeNull();
    await user.click(within(section()).getByRole("button", { name: "Show all 12 subgenres" }));
    expect(within(section()).getAllByRole("link")).toHaveLength(12);
    const scrollIntoView = vi.fn();
    const heading = within(section()).getByRole("heading", { name: "Subgenres" });
    heading.scrollIntoView = scrollIntoView;
    const fewer = within(section()).getByRole("button", { name: "Show fewer" });
    expect(fewer.getAttribute("aria-expanded")).toBe("true");
    await user.click(fewer);
    expect(within(section()).getAllByRole("link")).toHaveLength(10);
    expect(document.activeElement).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });
  it("shows no subgenre toggle at 10 or fewer", async () => {
    mocks.query.data = { ...fullPage, children: many("Sub", 10) };
    const { user } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    const section = screen.getByRole("region", { name: "Subgenres" });
    expect(within(section).getAllByRole("link")).toHaveLength(10);
    expect(within(section).queryByRole("button")).toBeNull();
  });
  it("caps related genres at 10 with a show-all toggle", async () => {
    mocks.query.data = { ...fullPage, related: many("Rel", 11) };
    const { user } = renderWithProviders(<GenrePage />);
    const section = () => screen.getByRole("region", { name: "Related genres" });
    expect(within(section()).getAllByRole("link")).toHaveLength(10);
    await user.click(within(section()).getByRole("button", { name: "Show all 11 related genres" }));
    expect(within(section()).getAllByRole("link")).toHaveLength(11);
  });
  it("pages albums by 24 on desktop and 10 on a phone", async () => {
    mocks.query.data = fullPage;
    const first = renderWithProviders(<GenrePage />);
    await first.user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 6, "albums", 24);
    mocks.useGenreResults.mockClear();
    setViewportWidth(390);
    renderWithProviders(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenCalledTimes(1);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 6, "tracks", 10);
  });
  it("puts Play all and Shuffle in the phone header and drops the in-page row", async () => {
    mocks.query.data = fullPage;
    setViewportWidth(390);
    const { user } = renderWithProviders(<GenrePage />);
    const bar = within(screen.getByTestId("page-header-phone-actions"));
    await user.click(bar.getByRole("button", { name: "Play all" }));
    expect(mocks.play).toHaveBeenLastCalledWith(false);
    await user.click(bar.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Shuffle" }));
    expect(mocks.play).toHaveBeenLastCalledWith(true);
    // Only the header has them: no third pair in the body.
    expect(screen.getAllByRole("button", { name: "Play all", hidden: true })).toHaveLength(2);
  });
  it("disables the phone Play all key and Shuffle item with nothing playable", async () => {
    mocks.query.data = { ...fullPage, stats: { ...fullPage.stats, playable_tracks: 0 } };
    setViewportWidth(390);
    const { user } = renderWithProviders(<GenrePage />);
    const bar = within(screen.getByTestId("page-header-phone-actions"));
    expect((bar.getByRole("button", { name: "Play all" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("No playable tracks in this genre yet.")).toBeTruthy();
    await user.click(bar.getByRole("button", { name: "More actions" }));
    expect(
      (await screen.findByRole("menuitem", { name: "Shuffle" })).getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("shows track cards on a phone, with no list header", () => {
    mocks.query.data = fullPage;
    setViewportWidth(390);
    renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("track-row").textContent).toBe("r1 cardr1");
    expect(screen.queryByText("Release")).toBeNull();
  });
  it("offers Rows/Cards on desktop for Tracks only, and remembers the choice", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("track-row").textContent).toBe("r1 rowr1");
    const rowsHeader = () => screen.queryByText("Release");
    const view = () => screen.getByRole("radiogroup", { name: "View", hidden: true });
    expect(view()).toBeTruthy();
    expect(rowsHeader()).not.toBeNull();
    await user.click(within(view()).getByText("Grid"));
    expect(screen.getByTestId("track-row").textContent).toBe("r1 cardr1");
    expect(localStorage.getItem("searchViewMode")).toBe("card");
    expect(rowsHeader()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(screen.queryByRole("radiogroup", { name: "View", hidden: true })).toBeNull();
  });
  it("below xl: related chips above the tabs, no sentinel, Show more fetches", async () => {
    mocks.query.data = fullPage;
    setViewportWidth(1000);
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.queryByTestId("genre-results-sentinel")).toBeNull();
    // The chip row replaces the aside's crate.
    const chips = screen.getByRole("region", { name: "Related genres" });
    expect(
      within(chips)
        .getByRole("link", { name: /Chicha/ })
        .getAttribute("href"),
    ).toBe("/genres/chicha");
    expect(screen.queryByRole("article", { name: "Related genres crate" })).toBeNull();
    expect(screen.getByText("Showing 1 of 24")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(mocks.results.fetchNextPage).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Albums [9]" }));
    expect(screen.getByText("Showing 1 of 9")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(mocks.results.fetchNextPage).toHaveBeenCalledTimes(2);
    // The insights below the list are reachable.
    expect(screen.getByRole("img", { name: /90–100 BPM/ })).toBeTruthy();
  });
  it("below xl: no Show more at the end, and no chip row without relatives", () => {
    mocks.query.data = { ...fullPage, related: [] };
    mocks.results.hasNextPage = false;
    setViewportWidth(1000);
    renderWithProviders(<GenrePage />);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Related genres" })).toBeNull();
  });
  it("at xl: the aside crate stays, with no chip row or Show more", () => {
    mocks.query.data = fullPage;
    renderWithProviders(<GenrePage />);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.getByRole("article", { name: "Related genres crate" })).toBeTruthy();
    expect(screen.getAllByRole("region", { name: "Related genres" })).toHaveLength(1);
  });
});
