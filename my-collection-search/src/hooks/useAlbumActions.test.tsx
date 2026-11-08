// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  replacePlaylist: vi.fn(),
  appendToQueue: vi.fn(),
  getAlbumWithTracks: vi.fn(),
  queueAlbumDownloads: vi.fn(),
  setQueue: vi.fn(),
  routerPush: vi.fn(),
  toast: vi.fn(),
  listRecordCopies: vi.fn(),
  createRecordAction: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => ({
  listRecordCopies: mocks.listRecordCopies,
  createRecordAction: mocks.createRecordAction,
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({
    replacePlaylist: mocks.replacePlaylist,
    appendToQueue: mocks.appendToQueue,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.routerPush }) }));
vi.mock("@/stores/enrichmentStore", () => ({
  useEnrichmentStore: (select: (state: { setQueue: typeof mocks.setQueue }) => unknown) =>
    select({ setQueue: mocks.setQueue }),
}));
vi.mock("@/services/internalApi/albums", () => ({
  getAlbumWithTracks: mocks.getAlbumWithTracks,
  fetchAlbumDiscogsRawRelease: vi.fn(),
  queueAlbumDownloads: mocks.queueAlbumDownloads,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import { useAlbumActions } from "./useAlbumActions";
import type { Album, Track } from "@/types/track";

const album = {
  release_id: "rel",
  friend_id: 7,
  title: "Blue Lines",
  artist: "Massive Attack",
  track_count: 2,
} as Album;
const tracks = [
  { track_id: "b", friend_id: 7, position: "B1", local_audio_url: "/b.mp3" },
  { track_id: "a", friend_id: 7, position: "A1", local_audio_url: "/a.mp3" },
] as Track[];

function Harness({ loaded = false }: { loaded?: boolean }) {
  const actions = useAlbumActions({
    album,
    tracks: loaded ? tracks : undefined,
    tracksLoaded: loaded,
  });
  return (
    <>
      <button onClick={() => actions.menuProps.onPlayAlbum?.()}>Play test</button>
      <button onClick={() => actions.menuProps.onAddToQueue?.()}>Queue test</button>
      <button onClick={() => actions.menuProps.onDownloadMissing?.()}>Download test</button>
      <button onClick={actions.loadTracks}>Load</button>
      {actions.menu}
      {actions.dialogs}
    </>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  setViewportWidth(1280);
});

describe("useAlbumActions", () => {
  it("plays in track order by replacing the playlist", async () => {
    const { user } = renderWithProviders(<Harness loaded />);
    await user.click(screen.getByRole("button", { name: "Play test" }));
    expect(mocks.replacePlaylist).toHaveBeenCalledWith([tracks[1], tracks[0]], {
      autoplay: true,
      startIndex: 0,
    });
    expect(mocks.appendToQueue).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Playing Blue Lines" }),
    );
  });

  it("adds playable tracks in order without replacing the playlist", async () => {
    const { user } = renderWithProviders(<Harness loaded />);
    await user.click(screen.getByRole("button", { name: "Queue test" }));
    expect(mocks.appendToQueue).toHaveBeenCalledWith([tracks[1], tracks[0]]);
    expect(mocks.replacePlaylist).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Added 2 tracks to the queue" }),
    );
  });

  it("fetches tracks lazily for an unloaded card", async () => {
    mocks.getAlbumWithTracks.mockResolvedValueOnce({ tracks });
    const { user } = renderWithProviders(<Harness />);
    expect(mocks.getAlbumWithTracks).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Load" }));
    expect(mocks.getAlbumWithTracks).toHaveBeenCalledWith("rel", 7);
  });

  it("reports albums that need no downloads", async () => {
    mocks.queueAlbumDownloads.mockResolvedValueOnce({ tracksQueued: 0 });
    const { user } = renderWithProviders(<Harness loaded />);
    await user.click(screen.getByRole("button", { name: "Download test" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "No Downloads Needed" }),
      ),
    );
  });

  it("reports album track loading and download errors", async () => {
    mocks.getAlbumWithTracks.mockRejectedValueOnce("tracks offline");
    const { user } = renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "tracks offline" }),
      ),
    );

    mocks.queueAlbumDownloads.mockRejectedValueOnce("download offline");
    cleanup();
    const loaded = renderWithProviders(<Harness loaded />);
    await loaded.user.click(screen.getByRole("button", { name: "Download test" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Unknown error" }),
      ),
    );
  });

  it("opens the raw Discogs dialog from the hook", async () => {
    mocks.getAlbumWithTracks.mockResolvedValueOnce({ tracks });
    const { user } = renderWithProviders(<Harness loaded />);
    await user.click(screen.getByRole("button", { name: "Album actions" }));
    await user.click(await screen.findByRole("button", { name: /View raw Discogs file/i }));
    expect(await screen.findByRole("dialog", { name: "Discogs Raw Release File" })).toBeTruthy();
  });

  describe("Log care from the header menu", () => {
    const logCareDialog = () => screen.findByText("Log Record Care");

    beforeEach(() => {
      mocks.listRecordCopies.mockResolvedValue({ items: [], overdue_days: 365 });
      mocks.createRecordAction.mockResolvedValue({});
    });

    // Regression: the phone modal ran the action and closed in one tick, so
    // the new dialog was discarded along with the modal.
    it("keeps the dialog open after the phone modal closes, and saves", async () => {
      setViewportWidth(400);
      const { user } = renderWithProviders(<Harness />);
      await user.click(screen.getByRole("button", { name: "Album actions" }));
      await user.click(within(screen.getByRole("dialog")).getByText("Log care"));
      expect(await logCareDialog()).toBeTruthy();
      await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mocks.createRecordAction).toHaveBeenCalledWith(
          expect.objectContaining({ friend_id: 7, release_id: "rel", action_type: "cleaned" }),
        ),
      );
      await waitFor(() => expect(screen.queryByText("Log Record Care")).toBeNull());
    });

    it("opens and saves from the desktop menu", async () => {
      const { user } = renderWithProviders(<Harness />);
      await user.click(screen.getAllByRole("button", { name: "Album actions", hidden: true })[1]);
      await user.click(await screen.findByRole("menuitem", { name: /Log care/i, hidden: true }));
      expect(await logCareDialog()).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mocks.createRecordAction).toHaveBeenCalledOnce());
      await waitFor(() => expect(screen.queryByText("Log Record Care")).toBeNull());
    });
  });
});
