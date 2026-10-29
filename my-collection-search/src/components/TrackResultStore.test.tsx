// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { sampleTrack } from "@/stories/fixtures/track";
import { useTrackStore } from "@/stores/trackStore";
import TrackResultStore from "./TrackResultStore";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayer: () => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack: vi.fn() }) }));

afterEach(() => useTrackStore.getState().clearTracks());

describe("TrackResultStore presentation forwarding", () => {
  it("uses the Zustand entity over its fallback and forwards dense layout props", () => {
    useTrackStore.getState().setTrack({ ...sampleTrack, title: "Hydrated title" });

    renderWithProviders(
      <TrackResultStore
        trackId={sampleTrack.track_id}
        friendId={sampleTrack.friend_id!}
        fallbackTrack={{ ...sampleTrack, title: "Fallback title" }}
        density="dense"
        layout="card"
      />,
    );

    expect(screen.getByTestId("track-result-dense-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Hydrated title" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Fallback title" })).toBeNull();
  });
});
