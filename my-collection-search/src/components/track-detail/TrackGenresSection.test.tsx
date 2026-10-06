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
    expect(screen.queryByText("Album (Discogs)")).toBeNull();
  });
});
