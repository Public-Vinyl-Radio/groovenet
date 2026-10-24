// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const modalProps = vi.hoisted(() => vi.fn());
const currentLibraryFriend = vi.hoisted(() => ({ id: 6, username: "dj" }));
const queries = vi.hoisted(() => ({
  trackQuery: {
    isLoading: false,
    error: null,
    data: { track_id: "t1", friend_id: 6, title: "Song" } as Record<string, unknown>,
  },
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
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: currentLibraryFriend }),
}));
vi.mock("@/hooks/useTrackDetailQueries", () => ({ useTrackDetailQueries: () => queries }));
vi.mock("@/components/AlbumArtworkDialog", () => ({
  default: (props: { open: boolean; releaseId: string; albumTitle?: string; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div role="dialog" aria-label="Cover art">
        {props.releaseId}:{props.albumTitle}
        <button onClick={() => props.onOpenChange(false)}>Close art</button>
      </div>
    ) : null,
}));
vi.mock("@/components/RelatedTracksSection", () => ({ default: () => null }));
vi.mock("@/components/track-detail", () => ({
  TrackPlaylistsSection: () => null,
  TrackHeader: (props: { showUsername?: boolean; onChangeArtwork?: () => void }) => (
    <div data-testid="track-result" data-show-username={String(props.showUsername)}>
      {props.onChangeArtwork && <button onClick={props.onChangeArtwork}>Cover Art...</button>}
    </div>
  ),
  TrackDebugModal: (props: unknown) => {
    modalProps(props);
    return null;
  },
}));

import TrackPage from "./page";

beforeEach(() => {
  currentLibraryFriend.id = 6;
});

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

describe("TrackPage username attribution", () => {
  // The URL's friend_id is fixed at 6 by the next/navigation mock above.
  it("hides the username when the track is in the library already being browsed", () => {
    currentLibraryFriend.id = 6;
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("track-result").dataset.showUsername).toBe("false");
  });

  it("shows the username when the track belongs to a different library", () => {
    currentLibraryFriend.id = 99;
    renderWithProviders(<TrackPage />);
    expect(screen.getByTestId("track-result").dataset.showUsername).toBe("true");
  });
});

describe("TrackPage cover art (#494)", () => {
  it("opens the album artwork dialog from the track menu", async () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song", release_id: "r9", album: "Blue Lines" };
    const { user } = renderWithProviders(<TrackPage />);

    await user.click(screen.getByRole("button", { name: "Cover Art..." }));
    expect(screen.getByRole("dialog", { name: "Cover art" }).textContent).toContain("r9:Blue Lines");

    await user.click(screen.getByRole("button", { name: "Close art" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Cover art" })).toBeNull());
  });

  it("offers no cover art action for a track without an album", () => {
    queries.trackQuery.data = { track_id: "t1", friend_id: 6, title: "Song" };
    renderWithProviders(<TrackPage />);
    expect(screen.queryByRole("button", { name: "Cover Art..." })).toBeNull();
  });
});
