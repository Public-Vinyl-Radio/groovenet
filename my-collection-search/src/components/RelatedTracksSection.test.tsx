// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track } from "@/types/track";

const mocks = vi.hoisted(() => ({
  scope: { scope: "library" as "library" | "all", savedScope: "library", libraryFriendId: 4, ready: true, setScope: vi.fn() },
  recommendations: vi.fn(),
  similar: vi.fn(),
  vibe: vi.fn(),
}));
const empty = { data: [], isLoading: false, error: null };

vi.mock("@/hooks/useSuggestionScope", () => ({ useSuggestionScope: () => mocks.scope }));
vi.mock("@/hooks/useRecommendations", () => ({ useRecommendationsQuery: mocks.recommendations }));
vi.mock("@/hooks/useSimilarTracks", () => ({ useSimilarTracks: mocks.similar }));
vi.mock("@/hooks/useSimilarVibeTracks", () => ({ useSimilarVibeTracks: mocks.vibe }));
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds: vi.fn(async () => []) }));
vi.mock("@/components/TrackResult", () => ({ default: (props: { track: Track }) => <div>result {props.track.track_id}</div> }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));

import RelatedTracksSection from "./RelatedTracksSection";

const track = { track_id: "seed", friend_id: 9, title: "Seed", artist: "A" } as Track;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { scope: "library", savedScope: "library", libraryFriendId: 4, ready: true, setScope: vi.fn() };
  mocks.recommendations.mockReturnValue(empty);
  mocks.similar.mockReturnValue({ data: { tracks: [] }, isLoading: false, error: null });
  mocks.vibe.mockReturnValue({ data: { tracks: [] }, isLoading: false, error: null });
});

describe("RelatedTracksSection scope", () => {
  it("asks every source for the selected library's scope", () => {
    renderWithProviders(<RelatedTracksSection track={track} />);

    expect(mocks.recommendations).toHaveBeenCalledWith([track], 60, { scope: "library", libraryFriendId: 4, enabled: true });
    for (const hook of [mocks.similar, mocks.vibe]) {
      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({ track_id: "seed", friend_id: 9, scope: "library", library_friend_id: 4, enabled: true })
      );
    }
  });

  it("switches the scope from its toggle", async () => {
    const { user } = renderWithProviders(<RelatedTracksSection track={track} />);
    await user.click(screen.getByText("All libraries"));
    expect(mocks.scope.setScope).toHaveBeenCalledWith("all");
  });

  it("suggests looking further when this library has nothing related", () => {
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("No related tracks in this library. Try All libraries.")).toBeTruthy();
  });

  it("says plainly when every library has nothing related", () => {
    mocks.scope.scope = "all";
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("No related tracks found.")).toBeTruthy();
  });

  it("counts and lists what comes back", async () => {
    mocks.similar.mockReturnValue({
      data: { tracks: [{ track_id: "s1", friend_id: 4, title: "S", artist: "A", distance: 0.1 }] },
      isLoading: false,
      error: null,
    });
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(await screen.findByText("result s1")).toBeTruthy();
    expect(screen.getByText("1 of 1")).toBeTruthy();
  });

  it("reports a failed source", () => {
    mocks.vibe.mockReturnValue({ data: undefined, isLoading: false, error: new Error("down") });
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("Could not load related tracks.")).toBeTruthy();
  });

  it.each(["recommendations", "similar", "vibe"] as const)("shows loading while %s is still loading", (source) => {
    mocks[source].mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("Loading related tracks...")).toBeTruthy();
  });

  it("shows loading, not an empty list, until the saved scope is known", () => {
    mocks.scope.ready = false;
    renderWithProviders(<RelatedTracksSection track={track} />);
    expect(screen.getByText("Loading related tracks...")).toBeTruthy();
    expect(mocks.recommendations).toHaveBeenCalledWith([track], 60, expect.objectContaining({ enabled: false }));
  });
});
