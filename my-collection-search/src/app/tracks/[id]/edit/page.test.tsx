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

  const header = () => within(screen.getByTestId("page-header"));

  it("titles the form under the track's trail", () => {
    renderWithProviders(<TrackEditPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit track" })).toBeTruthy();
    const trail = within(screen.getByTestId("page-header-breadcrumbs"));
    const link = (name: string) => trail.getByRole("link", { name, hidden: true });
    expect(link("Tracks").getAttribute("href")).toBe("/tracks");
    expect(link("Cumbia del Sol").getAttribute("href")).toBe("/tracks/t1?friend_id=1");
    expect(trail.getByText("Edit").getAttribute("aria-current")).toBe("page");
  });

  it("cancels back to where the user came from at both widths, without saving", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);
    for (const cancel of header().getAllByRole("button", { name: "Cancel", hidden: true }))
      await user.click(cancel);
    expect(mocks.back).toHaveBeenCalledTimes(2);
    expect(mocks.saveTrack).not.toHaveBeenCalled();
  });

  it("saves from the phone and desktop header actions", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);
    const saves = header().getAllByRole("button", { name: "Save", hidden: true });
    expect(saves).toHaveLength(2);
    await user.click(saves[0]);
    await waitFor(() => expect(mocks.saveTrack).toHaveBeenCalledTimes(1));
    await user.click(saves[1]);
    await waitFor(() => expect(mocks.saveTrack).toHaveBeenCalledTimes(2));
  });

  it("still submits with Enter in a field", async () => {
    const { user } = renderWithProviders(<TrackEditPage />);
    await user.type(screen.getByDisplayValue("Cumbia del Sol"), " Remix{Enter}");
    await waitFor(() =>
      expect(mocks.saveTrack).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Cumbia del Sol Remix" }),
      ),
    );
  });

  it("locks the header while a save is in flight", async () => {
    let finish = () => {};
    mocks.saveTrack.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { user } = renderWithProviders(<TrackEditPage />);
    await user.click(header().getAllByRole("button", { name: "Save", hidden: true })[0]);
    await waitFor(() =>
      expect(
        header()
          .getAllByRole("button", { hidden: true })
          .every((button) => (button as HTMLButtonElement).disabled),
      ).toBe(true),
    );
    finish();
    await waitFor(() => expect(mocks.back).toHaveBeenCalledTimes(1));
  });

  it("offers no Save until a track has loaded", () => {
    mocks.track = null;
    renderWithProviders(<TrackEditPage />);
    expect(header().queryByRole("button", { name: "Save", hidden: true })).toBeNull();
    expect(header().getAllByRole("button", { name: "Cancel", hidden: true })).toHaveLength(2);
    expect(header().queryByRole("link", { name: "Cumbia del Sol", hidden: true })).toBeNull();
  });
});
