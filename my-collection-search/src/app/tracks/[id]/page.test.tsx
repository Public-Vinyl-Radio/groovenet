// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/renderWithProviders";

const modalProps = vi.hoisted(() => vi.fn());
const queries = vi.hoisted(() => ({
  trackQuery: { isLoading: false, error: null, data: { track_id: "t1", friend_id: 6, title: "Song" } },
  playlistsQuery: {},
  audioMetadataQuery: {},
  essentiaQuery: {},
  identityEmbeddingPreviewQuery: { id: "identity" },
  contextEmbeddingPreviewQuery: { id: "context" },
  audioVibeEmbeddingPreviewQuery: { id: "vibe" },
  extractCoverMutation: {},
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useSearchParams: () => new URLSearchParams("friend_id=6"),
}));
vi.mock("@/hooks/useTrackDetailQueries", () => ({ useTrackDetailQueries: () => queries }));
vi.mock("@/components/TrackResultStore", () => ({ default: () => null }));
vi.mock("@/components/TrackActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/RelatedTracksSection", () => ({ default: () => null }));
vi.mock("@/components/track-detail", () => ({
  TrackPlaylistsSection: () => null,
  TrackDebugModal: (props: unknown) => {
    modalProps(props);
    return null;
  },
}));

import TrackPage from "./page";

describe("TrackPage", () => {
  it("hands the debug modal the context embedding preview", () => {
    renderWithProviders(<TrackPage />);
    expect(modalProps).toHaveBeenCalledWith(
      expect.objectContaining({
        identityEmbeddingPreviewQuery: { id: "identity" },
        contextEmbeddingPreviewQuery: { id: "context" },
        audioVibeEmbeddingPreviewQuery: { id: "vibe" },
      })
    );
  });
});
