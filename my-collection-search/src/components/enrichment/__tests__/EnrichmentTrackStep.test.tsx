// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Track, TrackGenre } from "@/types/track";

const { fetchMetadata, fetchGenreTree } = vi.hoisted(() => ({
  fetchMetadata: vi.fn(),
  fetchGenreTree: vi.fn(),
}));
vi.mock("@/hooks/useTrackMetadataMutation", () => ({
  useTrackMetadataMutation: () => ({ mutateAsync: fetchMetadata }),
}));
vi.mock("@/hooks/useYouTubeMusicSearchMutation", () => ({
  useYouTubeMusicSearchMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/services/aiService", () => ({ fetchAppleMusicAISearch: vi.fn() }));
vi.mock("@/services/internalApi/discogs", () => ({
  lookupDiscogsVideos: vi.fn(),
  extractDiscogsVideos: vi.fn(),
}));
vi.mock("@/services/internalApi/genres", () => ({ fetchGenreTree }));

import EnrichmentTrackStep from "../EnrichmentTrackStep";

const CUMBIA: TrackGenre = { id: "cumbia", name: "Cumbia", slug: "cumbia", parent_id: "latin", parent_name: "Latin" };
const CHICHA: TrackGenre = { id: "chicha", name: "Chicha", slug: "chicha", parent_id: "latin", parent_name: "Latin" };

const TRACK: Track = {
  track_id: "t1",
  friend_id: 6,
  title: "Cumbia del Sol",
  artist: "Los Destellos",
  album: "Constelación",
  year: "1970",
  local_tags: "Psychedelic Cumbia · Uplifting",
  track_genres: [CUMBIA],
  descriptors: ["sunny"],
  notes: "",
} as Track;

const LLM_ONLY = { llm: true, appleMusic: false, youtube: false, fetchAudio: false };

function renderStep(track: Track = TRACK) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderWithProviders(
    <EnrichmentTrackStep
      track={track}
      enrichmentTypes={LLM_ONLY}
      aiPrompt="Describe this track."
      onSave={onSave}
      onSkip={vi.fn()}
    />
  );
  return onSave;
}

describe("EnrichmentTrackStep — AI genres (#374)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchGenreTree.mockResolvedValue([]);
  });

  it("asks for the track's metadata with its id, so the album context is used", async () => {
    fetchMetadata.mockResolvedValueOnce({ genres: [], descriptors: [], notes: "" });
    renderStep();
    await waitFor(() => expect(fetchMetadata).toHaveBeenCalled());
    expect(fetchMetadata.mock.calls[0][0]).toMatchObject({ friend_id: 6, track_id: "t1" });
    expect(fetchMetadata.mock.calls[0][0].prompt).toMatch(/genres, descriptors, notes/);
  });

  it("pre-fills the picker and chips with the suggestion, and saves them as enrichment", async () => {
    fetchMetadata.mockResolvedValueOnce({
      genres: [CHICHA],
      descriptors: ["psychedelic", "late-night"],
      notes: "Peruvian chicha with surf guitar.",
    });
    const onSave = renderStep();

    const selected = await screen.findByTestId("genre-picker-selected");
    await waitFor(() => expect(within(selected).getByText("Chicha")).toBeTruthy());
    expect(within(selected).queryByText("Cumbia")).toBeNull();
    expect(screen.getByText("psychedelic")).toBeTruthy();
    expect(screen.getByText("Original tags: Psychedelic Cumbia · Uplifting")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const changes = onSave.mock.calls[0][0];
    expect(changes).toEqual({
      genres: ["chicha"],
      genre_source: "enrichment",
      descriptors: ["psychedelic", "late-night"],
      notes: "Peruvian chicha with surf guitar.",
    });
    expect(changes).not.toHaveProperty("local_tags");
  });

  it("keeps the track's own genres and descriptors when the AI suggests none, and sends no change", async () => {
    fetchMetadata.mockResolvedValueOnce({ genres: [], descriptors: [], notes: "" });
    const onSave = renderStep();
    await waitFor(() => expect(fetchMetadata).toHaveBeenCalled());

    expect(within(screen.getByTestId("genre-picker-selected")).getByText("Cumbia")).toBeTruthy();
    expect(screen.getByText("sunny")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });

  it("works for a track with no genres or descriptors yet", async () => {
    fetchMetadata.mockResolvedValueOnce({ genres: [CUMBIA], descriptors: [], notes: "" });
    const bare = { ...TRACK, track_genres: undefined, descriptors: undefined, local_tags: undefined };
    const onSave = renderStep(bare as Track);

    await screen.findByTestId("genre-picker-selected");
    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ genres: ["cumbia"], genre_source: "enrichment" })
    );
  });

  it("adds a descriptor typed as a chip", async () => {
    fetchMetadata.mockResolvedValueOnce({ genres: [], descriptors: [], notes: "" });
    const onSave = renderStep();
    await waitFor(() => expect(fetchMetadata).toHaveBeenCalled());

    await userEvent.type(screen.getByPlaceholderText(/Mood or description/), "hypnotic{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ descriptors: ["sunny", "hypnotic"] })
    );
  });

  it("saves nothing from the AI section once it is excluded", async () => {
    fetchMetadata.mockResolvedValueOnce({ genres: [CHICHA], descriptors: ["dub"], notes: "n" });
    const onSave = renderStep();
    await screen.findByText("dub");

    await userEvent.click(screen.getByText("Include"));
    await userEvent.click(screen.getByRole("button", { name: "Save & Next" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });
});
