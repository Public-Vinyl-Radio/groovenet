// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn() }),
}));
vi.mock("@/components/TrackPlaylistUsage", () => ({ default: () => null }));

import AlbumTrackItem from "./AlbumTrackItem";

const render = (track: Partial<Track>) =>
  renderWithProviders(
    <AlbumTrackItem track={{ ...sampleTrack, notes: "", ...track } as Track} albumArtist={sampleTrack.artist} />
  );

describe("AlbumTrackItem genre badges", () => {
  it("badges the track's taxonomy genres rather than its raw tags", () => {
    render({
      local_tags: "Psychedelic Cumbia",
      track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: null, parent_name: null }],
    });

    expect(screen.getByText("Cumbia")).toBeTruthy();
    expect(screen.queryByText("Psychedelic Cumbia")).toBeNull();
  });

  it("splits the raw tags into badges until the track is reconciled", () => {
    render({ local_tags: "Salsa, Boogaloo", track_genres: [] });

    expect(screen.getByText("Salsa")).toBeTruthy();
    expect(screen.getByText("Boogaloo")).toBeTruthy();
  });

  it("shows no genre row for a track with neither", () => {
    render({ local_tags: "", track_genres: [] });

    expect(screen.queryByText("Salsa")).toBeNull();
  });
});
