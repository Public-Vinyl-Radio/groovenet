// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({
  applyAlbumArtwork: vi.fn(),
  fetchAlbumArtworkReview: vi.fn(),
  queueAlbumArtworkBackfill: vi.fn(),
}));
vi.mock("@/services/internalApi/albumArtwork", () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));
const friend = vi.hoisted(() => ({ current: { id: 7, username: "me" } as { id: number; username: string } | null }));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: friend.current }) }));
const sync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAlbumArtwork", () => ({ syncArtworkIntoStores: sync }));

import AlbumArtworkReviewPage from "./page";

const mismatch = {
  release_id: "r1",
  friend_id: 7,
  title: "Blue Lines",
  artist: "Massive Attack",
  current_url: "https://i.discogs.com/r1.jpg",
  discogs_art_url: "https://i.discogs.com/r1.jpg",
  apple_music_art_url: "/uploads/album-covers/apple.jpg",
  art_match_status: "mismatch",
  art_match_distance: 24,
};
const noReference = {
  ...mismatch,
  release_id: "r2",
  title: "Mezzanine",
  current_url: null,
  discogs_art_url: null,
  art_match_status: "no_reference",
  art_match_distance: null,
};

beforeEach(() => {
  friend.current = { id: 7, username: "me" };
  api.fetchAlbumArtworkReview.mockResolvedValue({ albums: [mismatch, noReference] });
});
afterEach(() => vi.resetAllMocks());

describe("album artwork review page", () => {
  it("lists flagged albums with both covers", async () => {
    renderWithProviders(<AlbumArtworkReviewPage />);

    expect(await screen.findByText("Blue Lines")).toBeTruthy();
    expect(screen.getByText("Looks different · 24/64")).toBeTruthy();
    expect(screen.getByText("No Discogs art to compare")).toBeTruthy();
    expect(api.fetchAlbumArtworkReview).toHaveBeenCalledWith(7);
    // No Discogs art: nothing to keep.
    expect(screen.getAllByRole("button", { name: "Keep Discogs art" })).toHaveLength(1);
  });

  it("applies the Apple Music art or keeps the Discogs art", async () => {
    const state = { release_id: "r1", friend_id: 7 };
    api.applyAlbumArtwork.mockResolvedValue(state);
    const { user } = renderWithProviders(<AlbumArtworkReviewPage />);

    await screen.findByText("Blue Lines");
    await user.click(screen.getAllByRole("button", { name: "Use Apple Music art" })[0]);
    await waitFor(() => expect(sync).toHaveBeenCalledWith(state));
    expect(api.applyAlbumArtwork).toHaveBeenCalledWith("r1", 7, "apple_music");

    await user.click(screen.getByRole("button", { name: "Keep Discogs art" }));
    await waitFor(() => expect(api.applyAlbumArtwork).toHaveBeenLastCalledWith("r1", 7, "discogs"));
  });

  it("reports a failed decision", async () => {
    api.applyAlbumArtwork.mockRejectedValue("nope");
    const { user } = renderWithProviders(<AlbumArtworkReviewPage />);

    await user.click((await screen.findAllByRole("button", { name: "Use Apple Music art" }))[0]);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not update artwork", description: "nope" })
      )
    );
  });

  it("queues artwork matching for the current library", async () => {
    api.queueAlbumArtworkBackfill.mockResolvedValueOnce({ queuedAlbums: 3, queued: 3, tracksImpacted: 30, jobIds: [], errors: [] });
    const { user } = renderWithProviders(<AlbumArtworkReviewPage />);

    await user.click(await screen.findByRole("button", { name: "Run artwork matching" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Artwork matching queued", type: "success" })
      )
    );
    expect(api.queueAlbumArtworkBackfill).toHaveBeenCalledWith({ friend_id: 7 });
  });

  it("says when there is nothing to match, and when queueing fails", async () => {
    api.queueAlbumArtworkBackfill
      .mockResolvedValueOnce({ queuedAlbums: 0, queued: 0, tracksImpacted: 0, jobIds: [], errors: [] })
      .mockResolvedValueOnce({ queuedAlbums: 1, queued: 1, tracksImpacted: 1, jobIds: [], errors: [] })
      .mockRejectedValueOnce(new Error("redis down"));
    const { user } = renderWithProviders(<AlbumArtworkReviewPage />);
    const run = await screen.findByRole("button", { name: "Run artwork matching" });

    await user.click(run);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nothing to match", type: "info" }))
    );
    await user.click(run);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("1 album queued") })
      )
    );
    await user.click(run);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not queue artwork matching", description: "redis down" })
      )
    );
  });

  it("shows an empty state and a load error", async () => {
    api.fetchAlbumArtworkReview.mockResolvedValueOnce({ albums: [] });
    const first = renderWithProviders(<AlbumArtworkReviewPage />);
    expect(await screen.findByText("No albums need review.")).toBeTruthy();
    first.unmount();

    api.fetchAlbumArtworkReview.mockRejectedValueOnce(new Error("db down"));
    renderWithProviders(<AlbumArtworkReviewPage />);
    expect(await screen.findByText("db down")).toBeTruthy();
  });

  it("waits for the library before loading", () => {
    friend.current = null;
    renderWithProviders(<AlbumArtworkReviewPage />);
    expect(api.fetchAlbumArtworkReview).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Run artwork matching" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables both choices while one is being applied", async () => {
    api.fetchAlbumArtworkReview.mockResolvedValue({ albums: [mismatch] });
    api.applyAlbumArtwork.mockReturnValue(new Promise(() => {}));
    const { user } = renderWithProviders(<AlbumArtworkReviewPage />);

    await user.click(await screen.findByRole("button", { name: "Keep Discogs art" }));

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Use Apple Music art" }) as HTMLButtonElement).disabled).toBe(true)
    );
  });
});
