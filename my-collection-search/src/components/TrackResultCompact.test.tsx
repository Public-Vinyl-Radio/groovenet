// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { queryKeys } from "@/lib/queryKeys";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Track } from "@/types/track";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn() }),
}));

import TrackResultCompact from "./TrackResultCompact";

const taxonomy = [
  { id: "l", name: "Latin", slug: "latin", parent_id: null, source: "discogs", track_count: 0, album_count: 0,
    children: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: "l", source: "discogs", track_count: 0,
      album_count: 0, children: [] }] },
];

describe("TrackResultCompact genre badges", () => {
  it("links Discogs values and track genres to track search", async () => {
    const track = {
      ...sampleTrack,
      genres: ["Latin"],
      styles: ["Cumbia"],
      track_genres: [{ id: "c", name: "Cumbia", slug: "cumbia", parent_id: "l", parent_name: "Latin" }],
    } as Track;
    const { queryClient } = renderWithProviders(<TrackResultCompact track={track} />);
    queryClient.setQueryData(queryKeys.genreTree(), taxonomy);

    const latin = await screen.findByRole("link", { name: "Search tracks in Latin" });
    expect(latin.getAttribute("href")).toBe("/?genre=latin");
    expect(screen.getAllByRole("link", { name: "Search tracks in Cumbia" })).toHaveLength(2);
  });

  it("leaves an unreconciled raw tag unlinked", () => {
    renderWithProviders(
      <TrackResultCompact track={{ ...sampleTrack, genres: [], styles: [], track_genres: [], local_tags: "Feminist Anthem" } as Track} />
    );

    expect(screen.getByText("Feminist Anthem").closest("a")).toBeNull();
  });
});
