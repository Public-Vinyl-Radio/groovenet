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

describe("TrackResult genre badges in playlist mode", () => {
  it("badges the track's genres when the screen opts in, as search does", () => {
    renderWithProviders(<TrackResult track={track} playlistMode showTrackGenres />);

    const row = screen.getByTestId("track-genres");
    expect(within(row).getByText("Cumbia")).toBeTruthy();
    expect(within(row).queryByText("Psychedelic Cumbia")).toBeNull();
  });

  it("falls back to the raw tags for a track not yet reconciled", () => {
    renderWithProviders(<TrackResult track={{ ...track, track_genres: [] }} playlistMode showTrackGenres />);

    expect(within(screen.getByTestId("track-genres")).getByText("Psychedelic Cumbia")).toBeTruthy();
  });

  it("leaves dense playlist screens without the row by default", () => {
    renderWithProviders(<TrackResult track={track} playlistMode />);

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });

  it("shows no row for a track with no genres at all", () => {
    renderWithProviders(
      <TrackResult track={{ ...track, track_genres: [], local_tags: "" }} playlistMode showTrackGenres />
    );

    expect(screen.queryByTestId("track-genres")).toBeNull();
  });
});
