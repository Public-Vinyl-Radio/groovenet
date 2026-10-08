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

import PlaylistTrackItem from "./PlaylistTrackItem";

describe("PlaylistTrackItem 'No embedding' badge (#468)", () => {
  it("shows no badge when hasVectors is undefined — unknown, not missing", () => {
    const { hasVectors, ...rest } = sampleTrack;
    renderWithProviders(<PlaylistTrackItem track={rest as Track} />);

    expect(screen.queryByText("No embedding")).toBeNull();
  });

  it("shows the badge only when hasVectors is explicitly false", () => {
    renderWithProviders(<PlaylistTrackItem track={{ ...sampleTrack, hasVectors: false }} />);

    expect(screen.getByText("No embedding")).toBeTruthy();
  });

  it("shows no badge when hasVectors is true", () => {
    renderWithProviders(<PlaylistTrackItem track={{ ...sampleTrack, hasVectors: true }} />);

    expect(screen.queryByText("No embedding")).toBeNull();
  });
});
