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
