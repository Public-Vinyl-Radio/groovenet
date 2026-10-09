// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useAlbumStore } from "@/stores/albumStore";
import { useTrackStore } from "@/stores/trackStore";
import type { Album, Track } from "@/types/track";

const api = vi.hoisted(() => ({
  fetchAlbumArtwork: vi.fn(),
  previewAppleMusicArtwork: vi.fn(),
  applyAlbumArtwork: vi.fn(),
  uploadAlbumArtwork: vi.fn(),
}));
vi.mock("@/services/internalApi/albumArtwork", () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import AlbumArtworkDialog from "./AlbumArtworkDialog";

const DISCOGS = "https://i.discogs.com/r1.jpg";
const baseState = {
  release_id: "r1",
  friend_id: 7,
  current_url: DISCOGS,
  source: null,
  discogs_art_url: DISCOGS,
  apple_music_art_url: null,
  art_match_status: null,
  art_match_distance: null,
  has_local_audio: true,
};

function renderDialog() {
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <AlbumArtworkDialog open onOpenChange={onOpenChange} releaseId="r1" friendId={7} albumTitle="Blue Lines" />
  );
  return { ...rendered, onOpenChange };
}

beforeEach(() => {
  api.fetchAlbumArtwork.mockResolvedValue(baseState);
  useAlbumStore.getState().setAlbum({
    release_id: "r1",
    friend_id: 7,
    title: "Blue Lines",
    artist: "Massive Attack",
    track_count: 1,
  } as Album);
  useTrackStore.getState().setTracks([
    { track_id: "t1", friend_id: 7, release_id: "r1", title: "Safe", artist: "MA" } as Track,
  ]);
});
afterEach(() => vi.resetAllMocks());

describe("AlbumArtworkDialog", () => {
  it("previews Apple Music art full size and applies it to the album and its tracks", async () => {
    api.previewAppleMusicArtwork.mockResolvedValue({
      url: "/uploads/album-covers/apple.jpg",
      width: 1400,
      height: 1400,
      track_id: "t1",
    });
    api.applyAlbumArtwork.mockResolvedValue({
      ...baseState,
      current_url: "/uploads/album-covers/apple.jpg",
      source: "apple_music",
      apple_music_art_url: "/uploads/album-covers/apple.jpg",
    });
    const { user, onOpenChange } = renderDialog();

    expect(await screen.findByText("Discogs (default)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Preview Apple Music art/ }));

    expect(await screen.findByAltText("Apple Music cover")).toBeTruthy();
    expect(screen.getByText("Apple Music · 1400×1400")).toBeTruthy();
    expect(api.applyAlbumArtwork).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use Apple Music art" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.applyAlbumArtwork).toHaveBeenCalledWith("r1", 7, "apple_music");
    expect(useAlbumStore.getState().getAlbum("r1", 7)).toMatchObject({
      audio_file_album_art_url: "/uploads/album-covers/apple.jpg",
      album_art_source: "apple_music",
    });
    expect(useTrackStore.getState().getTrack("t1", 7)?.audio_file_album_art_url).toBe(
      "/uploads/album-covers/apple.jpg"
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Apple Music artwork applied" }));
  });

  it("goes back from a preview without applying", async () => {
    api.previewAppleMusicArtwork.mockResolvedValue({ url: "/a.jpg", width: 10, height: 10, track_id: "t1" });
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Preview Apple Music art/ }));
    await user.click(await screen.findByRole("button", { name: "Back" }));

    expect(await screen.findByRole("button", { name: /Restore Discogs art/ })).toBeTruthy();
    expect(api.applyAlbumArtwork).not.toHaveBeenCalled();
  });

  it("reports when there is no Apple Music art", async () => {
    api.previewAppleMusicArtwork.mockRejectedValue(new Error("No downloaded track on this album has embedded cover art"));
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Preview Apple Music art/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "No Apple Music artwork", type: "error" })
      )
    );
  });

  it("restores the Discogs art", async () => {
    api.fetchAlbumArtwork.mockResolvedValue({
      ...baseState,
      current_url: "/uploads/album-covers/apple.jpg",
      source: "apple_music",
      art_match_status: "mismatch",
    });
    api.applyAlbumArtwork.mockResolvedValue({
      ...baseState,
      current_url: "/uploads/album-covers/discogs.jpg",
      source: "discogs",
    });
    const { user, onOpenChange } = renderDialog();

    expect(await screen.findByText(/looks different from the\s+Discogs cover/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Restore Discogs art/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.applyAlbumArtwork).toHaveBeenCalledWith("r1", 7, "discogs");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Discogs artwork restored" }));
  });

  it("reports a failed restore", async () => {
    api.applyAlbumArtwork.mockRejectedValue(new Error("Could not download artwork: HTTP 404"));
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Restore Discogs art/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not restore Discogs artwork",
          description: "Could not download artwork: HTTP 404",
        })
      )
    );
  });

  it("disables what an album cannot do", async () => {
    api.fetchAlbumArtwork.mockResolvedValue({
      ...baseState,
      source: "discogs",
      has_local_audio: false,
    });
    renderDialog();

    const preview = await screen.findByRole("button", { name: /Preview Apple Music art/ });
    expect((preview as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Needs a downloaded track with embedded artwork.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Restore Discogs art/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Discogs")).toBeTruthy();
  });

  it("hides restore when there is no Discogs art, and shows no image without art", async () => {
    api.fetchAlbumArtwork.mockResolvedValue({ ...baseState, current_url: null, discogs_art_url: null });
    renderDialog();

    await screen.findByRole("button", { name: /Upload image/ });
    expect(screen.queryByRole("button", { name: /Restore Discogs art/ })).toBeNull();
    expect(screen.queryByAltText("Current cover")).toBeNull();
  });

  it("uploads an image", async () => {
    api.uploadAlbumArtwork.mockResolvedValue({
      ...baseState,
      current_url: "/uploads/album-covers/u.png",
      source: "upload",
    });
    const { user, onOpenChange } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Upload image/ }));
    expect(screen.getByText("Upload a cover image")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use this image" })).toBeNull();

    const file = new File(["img"], "c.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Use this image" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.uploadAlbumArtwork).toHaveBeenCalledWith("r1", 7, file);
  });

  it("reports a failed upload", async () => {
    api.uploadAlbumArtwork.mockRejectedValue("disk full");
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Upload image/ }));
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["img"], "c.png", { type: "image/png" })
    );
    await user.click(screen.getByRole("button", { name: "Use this image" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Upload failed", description: "disk full" })
      )
    );
  });

  it("shows a load error", async () => {
    api.fetchAlbumArtwork.mockRejectedValue(new Error("Album not found"));
    renderDialog();
    expect(await screen.findByText("Album not found")).toBeTruthy();
  });

  it("starts over at the overview when closed and reopened, and works without a title", async () => {
    const onOpenChange = vi.fn();
    const ui = (open: boolean) => (
      <AlbumArtworkDialog open={open} onOpenChange={onOpenChange} releaseId="r1" friendId={7} />
    );
    const { user, rerender } = renderWithProviders(ui(true));

    expect(await screen.findByText("Cover Art")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /Upload image/ }));
    expect(screen.getByText("Upload a cover image")).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    rerender(ui(false));
    rerender(ui(true));

    expect(await screen.findByRole("button", { name: /Upload image/ })).toBeTruthy();
    expect(screen.queryByText("Upload a cover image")).toBeNull();
  });

  it("disables every action while one is running", async () => {
    api.applyAlbumArtwork.mockReturnValue(new Promise(() => {}));
    const { user } = renderDialog();

    await user.click(await screen.findByRole("button", { name: /Restore Discogs art/ }));

    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Upload image/ }) as HTMLButtonElement).disabled).toBe(true)
    );
    expect((screen.getByRole("button", { name: /Preview Apple Music art/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
