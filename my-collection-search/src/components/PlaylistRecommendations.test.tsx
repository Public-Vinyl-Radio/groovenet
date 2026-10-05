// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  scope: { scope: "library" as "library" | "all", libraryFriendId: 4, ready: true, setScope: vi.fn() },
  recommendations: vi.fn(),
}));

vi.mock("@/hooks/useSuggestionScope", () => ({ useSuggestionScope: () => mocks.scope }));
vi.mock("@/hooks/useRecommendations", () => ({ useRecommendationsQuery: mocks.recommendations }));
vi.mock("@/providers/PlaylistPlayerProvider", () => ({ usePlaylistPlayer: () => ({ appendToQueue: vi.fn() }) }));
vi.mock("@/components/TrackResultStore", () => ({
  default: (props: { trackId: string }) => <div>suggestion {props.trackId}</div>,
}));

import PlaylistRecommendations from "./PlaylistRecommendations";

const playlist = [{ track_id: "p1", friend_id: 9 }] as Track[];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { scope: "library", libraryFriendId: 4, ready: true, setScope: vi.fn() };
  mocks.recommendations.mockReturnValue({ data: [], isLoading: false });
});

describe("PlaylistRecommendations scope", () => {
  it("asks for the selected library's scope and lists what comes back", () => {
    mocks.recommendations.mockReturnValue({
      data: [{ track_id: "r1", friend_id: 4, _simIdentity: 0.9, _simAudio: null }],
      isLoading: false,
    });
    renderWithProviders(<PlaylistRecommendations playlist={playlist} onAddToPlaylist={vi.fn()} />);

    expect(mocks.recommendations).toHaveBeenCalledWith(playlist, 50, { scope: "library", libraryFriendId: 4, enabled: true });
    expect(screen.getByText("suggestion r1")).toBeTruthy();
  });

  it("keeps the toggle when this library has no suggestions, and says so", async () => {
    const { user } = renderWithProviders(<PlaylistRecommendations playlist={playlist} onAddToPlaylist={vi.fn()} />);

    expect(screen.getByText("No suggestions in this library. Try All libraries.")).toBeTruthy();
    await user.click(screen.getByText("All libraries"));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });

  it("says plainly when every library has none", () => {
    mocks.scope.scope = "all";
    renderWithProviders(<PlaylistRecommendations playlist={playlist} onAddToPlaylist={vi.fn()} />);
    expect(screen.getByText("No suggestions found.")).toBeTruthy();
  });

  it("shows no empty message while the scope or results are still loading", () => {
    mocks.scope.ready = false;
    renderWithProviders(<PlaylistRecommendations playlist={playlist} onAddToPlaylist={vi.fn()} />);
    expect(screen.queryByText(/No suggestions/)).toBeNull();
  });
});
