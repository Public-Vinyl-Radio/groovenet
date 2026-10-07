// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  query: { data: undefined, error: null } as { data: unknown; error: Error | null },
  friend: { id: 6 } as { id: number } | null,
  useGenrePageQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ slug: "psychedelic%20cumbia" }) }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useGenrePageQuery", () => ({
  useGenrePageQuery: (...args: unknown[]) => {
    mocks.useGenrePageQuery(...args);
    return mocks.query;
  },
}));
vi.mock("@/components/TrackResultStore", () => ({
  default: (props: { trackId: string; footer: React.ReactNode }) => (
    <div data-testid="track-row">
      {props.trackId}
      {props.footer}
    </div>
  ),
}));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/AlbumResult", () => ({
  default: (props: { album: { release_id: string } }) => <div data-testid="album-row">{props.album.release_id}</div>,
}));

import GenrePage from "./page";

const ref = (id: string, name: string, track_count: number) => ({ id, name, slug: name.toLowerCase(), track_count });
const fullPage = {
  genre: {
    id: "g",
    name: "Psychedelic Cumbia",
    slug: "psychedelic-cumbia",
    parent_id: "c",
    source: "custom",
    aliases: ["chicha psicodelica"],
  },
  ancestors: [
    { id: "l", name: "Latin", slug: "latin" },
    { id: "c", name: "Cumbia", slug: "cumbia" },
  ],
  children: [ref("s", "Selva", 4)],
  related: [ref("ch", "Chicha", 12)],
  counts: { tracks: 20, albums: 3, tracks_total: 24, albums_total: 9 },
  top_tracks: [
    { track_id: "t1", friend_id: 6, play_count: 3 },
    { track_id: "t2", friend_id: 6, play_count: 0 },
  ],
  top_albums: [{ release_id: "r1", friend_id: 6, play_count: 4 }],
};

describe("genre page", () => {
  beforeEach(() => {
    mocks.useGenrePageQuery.mockReset();
    mocks.query = { data: undefined, error: null };
    mocks.friend = { id: 6 };
  });

  it("loads the decoded slug for the current collection, showing a skeleton meanwhile", () => {
    renderWithProviders(<GenrePage />);

    expect(mocks.useGenrePageQuery).toHaveBeenCalledWith("psychedelic cumbia", 6);
    expect(screen.getByTestId("genre-page-loading")).toBeTruthy();
  });

  it("waits for a collection before asking", () => {
    mocks.friend = null;
    renderWithProviders(<GenrePage />);
    expect(mocks.useGenrePageQuery).toHaveBeenCalledWith("psychedelic cumbia", undefined);
  });

  it("explains a failure, with a way back to all genres", () => {
    mocks.query = { data: undefined, error: new Error("Unknown genre: nope") };
    renderWithProviders(<GenrePage />);

    expect(screen.getByText("Unknown genre: nope")).toBeTruthy();
    expect(screen.getByRole("link", { name: "All genres" }).getAttribute("href")).toBe("/genres");
  });

  it("shows the lineage, counts, search links and related genres", () => {
    mocks.query = { data: fullPage, error: null };
    renderWithProviders(<GenrePage />);

    expect(screen.getByRole("heading", { name: "Psychedelic Cumbia" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Genres" }).getAttribute("href")).toBe("/genres");
    expect(screen.getByRole("link", { name: "Cumbia" }).getAttribute("href")).toBe("/genres/cumbia");
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getByText("Also matches chicha psicodelica")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Search tracks" }).getAttribute("href")).toBe("/?genre=psychedelic-cumbia");
    expect(screen.getByRole("link", { name: "Search albums" }).getAttribute("href")).toBe(
      "/albums?genre=psychedelic-cumbia"
    );
    expect(screen.getByText("20 tagged Psychedelic Cumbia directly")).toBeTruthy();
    expect(screen.getByText("3 with Psychedelic Cumbia on Discogs")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Subgenres" })).getByRole("link", { name: /Selva/ })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Related genres" })).getByRole("link", { name: /Chicha/ })).toBeTruthy();
  });

  it("ranks the top tracks, noting plays only where there were some, and lists the albums", () => {
    mocks.query = { data: fullPage, error: null };
    renderWithProviders(<GenrePage />);

    const rows = screen.getAllByTestId("track-row");
    expect(rows.map((row) => row.textContent)).toEqual(["t1#13× played", "t2#2"]);
    expect(screen.getAllByTestId("album-row").map((row) => row.textContent)).toEqual(["r1"]);
  });

  it("says so for an empty Discogs genre with no subgenres, no relatives and nothing in it", () => {
    mocks.query = {
      data: {
        ...fullPage,
        genre: { ...fullPage.genre, source: "discogs", aliases: [] },
        ancestors: [],
        children: [],
        related: [],
        top_tracks: [],
        top_albums: [],
      },
      error: null,
    };
    renderWithProviders(<GenrePage />);

    expect(screen.queryByText("Custom")).toBeNull();
    expect(screen.queryByText(/Also matches/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Subgenres" })).toBeNull();
    expect(screen.getByText("No related genres in the collection yet.")).toBeTruthy();
    expect(screen.getByText("No tracks in this genre yet.")).toBeTruthy();
    expect(screen.getByText("No albums in this genre yet.")).toBeTruthy();
  });
});
