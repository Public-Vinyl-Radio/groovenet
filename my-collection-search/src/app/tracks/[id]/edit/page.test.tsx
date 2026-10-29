// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

const CUMBIA: TrackGenre = {
  id: "cumbia",
  name: "Cumbia",
  slug: "cumbia",
  parent_id: "latin",
  parent_name: "Latin",
};

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

describe("TrackEditPage key confidence (#524)", () => {
  beforeEach(() => {
    mocks.fetchGenreTree.mockReset().mockResolvedValue([]);
    mocks.saveTrack.mockReset().mockResolvedValue(undefined);
  });

  it("flags a low-confidence key as uncertain, with the percentage", () => {
    mocks.track = {
      track_id: "t1",
      friend_id: 1,
      title: "Cumbia del Sol",
      artist: "Los Destellos",
      key: "F major",
      key_confidence: 0.42,
    } as Partial<Track>;

    renderWithProviders(<TrackEditPage />);

    expect(screen.getByText(/Uncertain key — 42% confident/)).toBeTruthy();
  });

  it("shows the plain percentage for a confident key, not the uncertain flag", () => {
    mocks.track = {
      track_id: "t1",
      friend_id: 1,
      title: "Cumbia del Sol",
      artist: "Los Destellos",
      key: "F major",
      key_confidence: 0.9,
    } as Partial<Track>;

    renderWithProviders(<TrackEditPage />);

    expect(screen.queryByText(/Uncertain key/)).toBeNull();
    expect(screen.getByText("90% confident")).toBeTruthy();
  });
});

describe("TrackEditPage bpm confidence (#531)", () => {
  beforeEach(() => {
    mocks.fetchGenreTree.mockReset().mockResolvedValue([]);
    mocks.saveTrack.mockReset().mockResolvedValue(undefined);
  });

  const baseTrack = {
    track_id: "t1",
    friend_id: 1,
    title: "Cumbia del Sol",
    artist: "Los Destellos",
    bpm: "103",
  };

  it("flags a low-confidence BPM as uncertain, with the percentage", () => {
    mocks.track = { ...baseTrack, bpm_confidence: 0.02 } as Partial<Track>;

    renderWithProviders(<TrackEditPage />);

    expect(screen.getByText(/Uncertain BPM — 2% confident/)).toBeTruthy();
  });

  it("shows the plain percentage for a confident BPM, not the uncertain flag", () => {
    mocks.track = { ...baseTrack, bpm_confidence: 0.26 } as Partial<Track>;

    renderWithProviders(<TrackEditPage />);

    expect(screen.queryByText(/Uncertain BPM/)).toBeNull();
    expect(screen.getByText("26% confident")).toBeTruthy();
  });

  it("shows nothing for a BPM with no confidence on record", () => {
    mocks.track = baseTrack as Partial<Track>;

    renderWithProviders(<TrackEditPage />);

    expect(screen.queryByText(/% confident/)).toBeNull();
  });
});

describe("TrackEditPage header", () => {
  beforeEach(() => {
    mocks.fetchGenreTree.mockReset().mockResolvedValue([]);
    mocks.saveTrack.mockReset().mockResolvedValue(undefined);
    mocks.back.mockReset();
    mocks.track = {
      track_id: "t1",
      friend_id: 1,
      title: "Cumbia del Sol",
      artist: "Los Destellos",
      track_genres: [],
    } as Partial<Track>;
  });

  it("cancels back to where the user came from, without saving", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit Track" })).toBeTruthy();
    await user.click(
      within(screen.getByTestId("page-header")).getByRole("button", {
        name: "Cancel",
        hidden: true,
      }),
    );
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.saveTrack).not.toHaveBeenCalled();
  });

  it("saves from the header action", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);
    const header = screen.getByTestId("page-header");
    await user.click(within(header).getByRole("button", { name: "Save", hidden: true }));
    await waitFor(() => expect(mocks.saveTrack).toHaveBeenCalledOnce());
  });

  it("offers no Save until a track has loaded", () => {
    mocks.track = null;
    renderWithProviders(<TrackEditPage />);
    const header = screen.getByTestId("page-header");
    expect(within(header).queryByRole("button", { name: "Save", hidden: true })).toBeNull();
    expect(within(header).getByRole("button", { name: "Cancel", hidden: true })).toBeTruthy();
  });
});
