// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn() }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));
vi.mock("./TrackPlaylistUsage", () => ({ default: () => null }));

import TrackResult from "./TrackResult";

const track = {
  ...sampleTrack,
  local_tags: "Psychedelic Cumbia",
  track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }],
} as Track;

describe("TrackResult 'No embedding' badge (#468)", () => {
  it("shows no badge when hasVectors is undefined — unknown, not missing", () => {
    const { hasVectors, ...rest } = track;
    renderWithProviders(<TrackResult track={rest as Track} playlistMode />);

    expect(screen.queryByText("No embedding")).toBeNull();
  });

  it("shows the badge only when hasVectors is explicitly false", () => {
    renderWithProviders(<TrackResult track={{ ...track, hasVectors: false }} playlistMode />);

    expect(screen.getByText("No embedding")).toBeTruthy();
  });

  it("shows no badge when hasVectors is true", () => {
    renderWithProviders(<TrackResult track={{ ...track, hasVectors: true }} playlistMode />);

    expect(screen.queryByText("No embedding")).toBeNull();
  });
});

describe("TrackResult genre badges (#470)", () => {
  it("badges the track's DJ genres in playlist mode by default, no opt-in needed", () => {
    renderWithProviders(<TrackResult track={track} playlistMode />);

    const row = screen.getByTestId("track-genres");
    expect(within(row).getAllByText("Cumbia").length).toBeGreaterThan(0);
    expect(within(row).queryByText("Psychedelic Cumbia")).toBeNull();
  });

  it("badges the track's DJ genres in the default (non-playlist) layout too", () => {
    renderWithProviders(<TrackResult track={track} />);

    const row = screen.getByTestId("track-genres");
    expect(within(row).getAllByText("Cumbia").length).toBeGreaterThan(0);
  });

  it("falls back to the raw tags for a track not yet reconciled", () => {
    renderWithProviders(<TrackResult track={{ ...track, track_genres: [] }} playlistMode />);

    expect(within(screen.getByTestId("track-genres")).getAllByText("Psychedelic Cumbia").length).toBeGreaterThan(0);
  });

  it("falls back to the album's Discogs styles when the track has no DJ genres at all", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, track_genres: [], local_tags: "", styles: ["Bossa Nova"] }}
        playlistMode
      />
    );

    expect(within(screen.getByTestId("track-genres")).getAllByText("Bossa Nova").length).toBeGreaterThan(0);
  });

  it("shows no row for a track with no genres and no Discogs styles", () => {
    renderWithProviders(
      <TrackResult
        track={{ ...track, track_genres: [], local_tags: "", styles: [] }}
        playlistMode
      />
    );

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("can be turned off for screens that don't want badges", () => {
    renderWithProviders(<TrackResult track={track} playlistMode showGenres={false} />);

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("folds overflow genres into a +N badge instead of showing every one", () => {
    const manyGenres = {
      ...track,
      track_genres: [
        { id: "a", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null },
        { id: "b", name: "Chicha", slug: "chicha", parent_id: null, parent_name: null },
        { id: "c", name: "Salsa", slug: "salsa", parent_id: null, parent_name: null },
        { id: "d", name: "Merengue", slug: "merengue", parent_id: null, parent_name: null },
        { id: "e", name: "Bolero", slug: "bolero", parent_id: null, parent_name: null },
      ],
    };
    renderWithProviders(<TrackResult track={manyGenres} playlistMode />);

    expect(screen.getAllByText("+2").length).toBeGreaterThan(0);
  });
});
