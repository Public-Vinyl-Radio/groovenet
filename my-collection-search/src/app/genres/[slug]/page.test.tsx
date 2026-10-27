// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  query: { data: undefined, error: null, refetch: vi.fn() } as { data: unknown; error: Error | null; refetch: ReturnType<typeof vi.fn> },
  friend: { id: 6 } as { id: number } | null,
  useGenrePageQuery: vi.fn(), useGenreResults: vi.fn(), play: vi.fn(),
  results: { data: { pages: [{ refs: [{ id: "r1", friend_id: 6 }] }] }, isPending: false, hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false, error: null as Error | null, fetchNextPage: vi.fn(), refetch: vi.fn() },
  playback: { busy: false, problem: null as string | null },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "psychedelic%20cumbia" }) }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useGenrePageQuery", () => ({ useGenrePageQuery: (...args: unknown[]) => { mocks.useGenrePageQuery(...args); return mocks.query; } }));
vi.mock("@/hooks/useGenreResults", () => ({ useGenreResults: (...args: unknown[]) => { mocks.useGenreResults(...args); return mocks.results; } }));
vi.mock("@/hooks/useGenrePlayback", () => ({ useGenrePlayback: () => ({ ...mocks.playback, play: mocks.play }) }));
vi.mock("@/components/TrackResultStore", () => ({ default: (props: { trackId: string; layout: string }) => <div data-testid="track-row">{props.trackId} {props.layout}</div> }));
vi.mock("@/components/AlbumResult", () => ({ default: (props: { albumRef: { release_id: string }; layout: string }) => <div data-testid="album-row">{props.albumRef.release_id} {props.layout}</div> }));
import GenrePage from "./page";
const ref = (id: string, name: string, track_count: number) => ({ id, name, slug: name.toLowerCase(), track_count });
const fullPage = {
  genre: { id: "g", name: "Psychedelic Cumbia", slug: "psychedelic-cumbia", parent_id: "c", source: "custom", aliases: ["chicha psicodelica", "A very long alias ".repeat(30)] },
  ancestors: [{ id: "l", name: "Latin", slug: "latin" }, { id: "c", name: "Cumbia", slug: "cumbia" }],
  children: [ref("s", "Selva", 4)], related: [ref("ch", "Chicha", 12)],
  counts: { tracks: 20, albums: 3, tracks_total: 24, albums_total: 9 },
  stats: { bpm_min: 90.5, bpm_max: 128, year: 2026, added_this_year: 5, playable_tracks: 20, bpm_histogram: [{ min: 90, max: 100, count: 3 }, { min: 120, max: 130, count: 1 }] },
  // Samples must never be used as the full results.
  top_tracks: [{ track_id: "SAMPLE" }], top_albums: [{ release_id: "SAMPLE" }],
};

describe("genre detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = { data: undefined, error: null, refetch: vi.fn() };
    mocks.friend = { id: 6 };
    mocks.results = { data: { pages: [{ refs: [{ id: "r1", friend_id: 6 }] }] }, isPending: false, hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false, error: null, fetchNextPage: vi.fn(), refetch: vi.fn() };
    mocks.playback = { busy: false, problem: null };
  });
  it("loads the decoded slug for the collection and waits without one", () => {
    const { rerender } = renderWithProviders(<GenrePage />);
    expect(mocks.useGenrePageQuery).toHaveBeenCalledWith("psychedelic cumbia", 6);
    expect(screen.getByTestId("genre-page-loading")).toBeTruthy();
    mocks.friend = null; rerender(<GenrePage />);
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
  it("shows hierarchy, full stats, cover results and linked subgenres/relatives", () => {
    mocks.query.data = fullPage;
    renderWithProviders(<GenrePage />);
    expect(getComputedStyle(screen.getByRole("heading", { name: "Psychedelic Cumbia" })).fontSize).toBe("20px");
    expect(screen.getByRole("link", { name: "Cumbia", hidden: true }).getAttribute("href")).toBe("/genres/cumbia");
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy(); expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("90.5–128")).toBeTruthy(); expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Added this year").parentElement?.title).toContain("date_added");
    expect(screen.getByTestId("album-row").textContent).toBe("r1 cover");
    expect(screen.queryByText("SAMPLE")).toBeNull();
    expect(screen.queryByTestId("track-row")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Subgenres" })).getByRole("link", { name: /Selva/ })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Related genres" })).getByRole("link", { name: /Chicha/ }).getAttribute("href")).toBe("/genres/chicha");
    expect(screen.getByRole("img", { name: /90–100 BPM: 3 tracks/ })).toBeTruthy();
  });
  it("expands long aliases with a labelled more/less control", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(more.getAttribute("aria-controls")!)?.textContent).toContain("chicha psicodelica");
    await user.click(more); expect(screen.getByRole("button", { name: "Less" }).getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Less" })); expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("switches to existing track rows, loads later pages, and calls both playback actions", async () => {
    mocks.query.data = fullPage;
    const { user } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Tracks [24]" }));
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 6, "tracks");
    expect(screen.getByTestId("track-row").textContent).toBe("r1 row");
    expect(screen.getByRole("button", { name: "Tracks [24]" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Load more tracks" })); expect(mocks.results.fetchNextPage).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Play all" })); expect(mocks.play).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Shuffle" })); expect(mocks.play).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Albums [9]" })); expect(screen.getByTestId("album-row")).toBeTruthy();
  });
  it("covers a leaf with no aliases, results, playable tracks, BPM or relatives", async () => {
    mocks.query.data = { ...fullPage, genre: { ...fullPage.genre, source: "discogs", aliases: [] }, children: [], related: [], stats: { ...fullPage.stats, bpm_min: null, bpm_max: null, playable_tracks: 0, bpm_histogram: [] } };
    mocks.results.data.pages = [{ refs: [] }]; mocks.results.hasNextPage = false;
    const { user } = renderWithProviders(<GenrePage />);
    expect(screen.getByText("No albums in this genre yet.")).toBeTruthy();
    expect(screen.getByText("No BPM data for this genre yet.")).toBeTruthy();
    expect(screen.getByText("No related genres in the collection yet.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Subgenres" })).toBeNull(); expect(screen.queryByText("Custom")).toBeNull();
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect((screen.getByRole("button", { name: "Play all" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tracks [24]" })); expect(screen.getByText("No tracks in this genre yet.")).toBeTruthy();
  });
  it("covers loading, busy playback and playback failures", () => {
    mocks.query.data = fullPage; mocks.results.isPending = true; mocks.playback = { busy: true, problem: "Playback failed" };
    renderWithProviders(<GenrePage />);
    expect(screen.getByTestId("genre-results-loading")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Shuffle" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Playback failed");
  });
  it("retries a failed initial results query and a failed next page", async () => {
    mocks.query.data = fullPage; mocks.results.error = new Error("Offline"); mocks.results.isFetchNextPageError = true;
    const { user, rerender } = renderWithProviders(<GenrePage />);
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    await user.click(screen.getByRole("button", { name: "Try again" })); expect(mocks.results.fetchNextPage).toHaveBeenCalledOnce();
    Object.assign(mocks.results, { data: undefined, isFetchNextPageError: false }); rerender(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Try again" })); expect(mocks.results.refetch).toHaveBeenCalledOnce();
  });
  it("resets view and alias expansion on collection changes", async () => {
    mocks.query.data = fullPage;
    const { user, rerender } = renderWithProviders(<GenrePage />);
    await user.click(screen.getByRole("button", { name: "Tracks [24]" })); await user.click(screen.getByRole("button", { name: "More" }));
    mocks.friend = { id: 7 }; rerender(<GenrePage />);
    expect(mocks.useGenreResults).toHaveBeenLastCalledWith("psychedelic-cumbia", 7, "albums");
    expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-expanded")).toBe("false");
  });
});
