// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track, TrackGenre } from "@/types/track";

const mocks = vi.hoisted(() => ({
  fetchGenreTree: vi.fn(),
  saveTrack: vi.fn(),
  back: vi.fn(),
  track: null as unknown,
}));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree: mocks.fetchGenreTree }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useSearchParams: () => new URLSearchParams("friend_id=1"),
  useRouter: () => ({ back: mocks.back }),
}));
vi.mock("@/hooks/useTrackByIdQuery", () => ({
  useTrackByIdQuery: () => ({ data: mocks.track, isLoading: false }),
}));
vi.mock("@/hooks/useTracksQuery", () => ({
  useTracksQuery: () => ({ saveTrack: mocks.saveTrack }),
}));
vi.mock("@/components/track-edit/useTrackEditAudioActions", () => ({
  useTrackEditAudioActions: () => ({}),
}));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));

import TrackEditPage from "./page";

const CUMBIA: TrackGenre = { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin" };

describe("TrackEditPage genres", () => {
  beforeEach(() => {
    mocks.fetchGenreTree.mockReset().mockResolvedValue([]);
    mocks.saveTrack.mockReset().mockResolvedValue(undefined);
    mocks.track = {
      track_id: "t1",
      friend_id: 1,
      title: "Cumbia del Sol",
      artist: "Los Destellos",
      local_tags: "Psychedelic Cumbia",
      track_genres: [CUMBIA],
    } as Partial<Track>;
  });

  it("replaces the free-text genre box with the picker and the original tags", () => {
    renderWithProviders(<TrackEditPage />);

    expect(screen.getByRole("button", { name: "Remove Cumbia", hidden: true })).toBeTruthy();
    expect(screen.getByText("Original tags: Psychedelic Cumbia")).toBeTruthy();
    expect(screen.queryByText("Genre tags (comma separated)")).toBeNull();
  });

  it("saves the edited genre ids", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);

    await user.click(screen.getByRole("button", { name: "Remove Cumbia", hidden: true }));
    await user.click(screen.getAllByRole("button", { name: /Save/, hidden: true })[0]);

    await waitFor(() => expect(mocks.saveTrack).toHaveBeenCalledOnce());
    expect(mocks.saveTrack.mock.calls[0][0]).toMatchObject({ track_id: "t1", genres: [] });
  });
});
