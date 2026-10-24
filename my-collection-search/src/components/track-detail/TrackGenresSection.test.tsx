// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";
import TrackGenresSection from "./TrackGenresSection";

const taxonomy = [
  {
    id: "latin",
    name: "Latin",
    slug: "latin",
    parent_id: null,
    source: "discogs" as const,
    track_count: 0,
    album_count: 0,
    children: [],
  },
];

function renderSection(track: Partial<Track>) {
  const fallbackTrack = { ...sampleTrack, track_id: "detail-1", friend_id: 99, ...track } as Track;
  const view = renderWithProviders(
    <TrackGenresSection trackId="detail-1" friendId={99} fallbackTrack={fallbackTrack} />
  );
  view.queryClient.setQueryData(queryKeys.genreTree(), taxonomy);
  return view;
}

describe("TrackGenresSection", () => {
  it("links the track's genres and its album's known Discogs values to track search", async () => {
    renderSection({
      track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin" }],
      genres: ["Latin"],
      styles: ["Unmapped Style"],
    });

    const section = screen.getByTestId("track-genres-section");
    expect(within(section).getByRole("link", { name: "Search tracks in Cumbia" }).getAttribute("href")).toBe(
      "/?genre=cumbia"
    );
    expect((await within(section).findByRole("link", { name: "Search tracks in Latin" })).getAttribute("href")).toBe(
      "/?genre=latin"
    );
    expect(within(section).getByText("Unmapped Style").closest("a")).toBeNull();
  });

  it("says so when the track has no genres, and drops the album row without Discogs values", () => {
    renderSection({ track_genres: [], local_tags: undefined, genres: [], styles: [] });

    expect(screen.getByText("No genres yet")).toBeTruthy();
    expect(screen.queryByText("Album")).toBeNull();
  });

  it("labels the album's values and shows each genre once", () => {
    renderSection({
      track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }],
      genres: ["Latin"],
      styles: ["cumbia", "Psychedelic"],
    });

    expect(screen.getByText("Album")).toBeTruthy();
    expect(screen.getAllByText(/^cumbia$/i)).toHaveLength(1);
    expect(screen.getByText("Psychedelic")).toBeTruthy();
    expect(screen.getByText("Latin")).toBeTruthy();
  });

  it("is one inline row, not a card with a heading", () => {
    renderSection({ track_genres: [], local_tags: undefined, genres: [], styles: [] });
    expect(screen.queryByRole("heading")).toBeNull();
  });
});

it("shows effective album values apart from the track's own links", () => {
  renderSection({ genres: ["Source"], styles: ["Old Style"], album_genres: [], album_styles: ["Fusion"], track_genres: [{ id: "s", name: "Salsa", slug: "salsa", parent_id: null, parent_name: null }] });
  expect(screen.getByText("Fusion")).toBeTruthy();
  expect(screen.getByText("Salsa")).toBeTruthy();
  expect(screen.queryByText("Source")).toBeNull();
  expect(screen.queryByText("Old Style")).toBeNull();
});
