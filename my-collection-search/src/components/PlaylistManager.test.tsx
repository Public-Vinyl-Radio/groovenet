// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Playlist, Track } from "@/types/track";

const tracks = [{ track_id: "t1", friend_id: 1, title: "A", artist: "B" }] as Track[];

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  fetchPlaylists: vi.fn(),
  deletePlaylist: vi.fn(),
  appendToQueue: vi.fn(),
  replacePlaylist: vi.fn(),
  fetchTracksByIds: vi.fn(),
  exportPlaylistToPDF: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
}));

const playlists = [
  { id: 5, name: "Late Night", tracks: [{}, {}], total_duration_seconds: 3900, created_at: "2026-01-01T00:00:00Z" },
] as unknown as Playlist[];

const providerState = vi.hoisted(() => ({ playlists: null as unknown[] | null, loading: false }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/providers/PlaylistsProvider", () => ({
  usePlaylists: () => ({
    playlists: providerState.playlists ?? playlists,
    playlistsLoading: providerState.loading,
    loadingPlaylists: null,
    fetchPlaylists: mocks.fetchPlaylists,
  }),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: mocks.replacePlaylist, appendToQueue: mocks.appendToQueue }),
}));
vi.mock("@/hooks/useFriendsQuery", () => ({ useFriendsQuery: () => ({ friends: [] }) }));
vi.mock("@/hooks/useDeletePlaylistMutation", () => ({
  useDeletePlaylistMutation: () => ({ mutateAsync: mocks.deletePlaylist, isPending: false }),
}));
vi.mock("@/services/internalApi/tracks", () => ({ fetchTracksByIds: mocks.fetchTracksByIds }));
vi.mock("@/services/internalApi/playlists", () => ({ createSetForPlaylist: vi.fn(), importPlaylist: vi.fn() }));
vi.mock("@/lib/exportPlaylistPdf", () => ({ exportPlaylistToPDF: mocks.exportPlaylistToPDF }));
vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => null,
  toaster: { create: mocks.toast },
}));
vi.mock("@/components/FriendSelectDialog", () => ({ default: () => null }));

import PlaylistManager from "./PlaylistManager";

afterEach(() => {
  vi.clearAllMocks();
  providerState.playlists = null;
  providerState.loading = false;
});

async function openRowModal() {
  const rendered = renderWithProviders(<PlaylistManager />);
  await rendered.user.click(screen.getAllByRole("button", { name: "Playlist actions", hidden: true })[0]);
  await screen.findByRole("button", { name: "Play now" });
  return rendered;
}

describe("PlaylistManager row actions (#751)", () => {
  it("summarises the playlist in the modal strip", async () => {
    await openRowModal();
    expect(screen.getAllByText(/2 tracks · 1h 5m/).length).toBeGreaterThan(0);
  });

  it("enqueues the playlist's tracks", async () => {
    mocks.fetchTracksByIds.mockResolvedValue(tracks);
    const { user } = await openRowModal();
    await user.click(screen.getByRole("button", { name: "Enqueue" }));
    await waitFor(() => expect(mocks.appendToQueue).toHaveBeenCalledWith(tracks));
  });

  it("exports a PDF named after the playlist", async () => {
    mocks.fetchTracksByIds.mockResolvedValue(tracks);
    const { user } = await openRowModal();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() =>
      expect(mocks.exportPlaylistToPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          playlist: tracks,
          playlistName: "Late Night",
          totalPlaytimeFormatted: "1h 5m",
          filename: expect.stringMatching(/^late-night-\d{4}-\d{2}-\d{2}_.*\.pdf$/),
        })
      )
    );
  });

  it("asks to confirm, then deletes", async () => {
    mocks.deletePlaylist.mockResolvedValue(undefined);
    const { user } = await openRowModal();
    await user.click(screen.getByRole("button", { name: "Delete playlist" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(mocks.deletePlaylist).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Delete playlist" }).find((b) => dialog.contains(b))!);

    await waitFor(() => expect(mocks.deletePlaylist).toHaveBeenCalledWith(5));
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Playlist deleted.", type: "success" });
    expect(mocks.fetchPlaylists).toHaveBeenCalled();
  });

  it("keeps the prompt open and reports a failed delete", async () => {
    mocks.deletePlaylist.mockRejectedValue(new Error("nope"));
    const { user } = await openRowModal();
    await user.click(screen.getByRole("button", { name: "Delete playlist" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(screen.getAllByRole("button", { name: "Delete playlist" }).find((b) => dialog.contains(b))!);

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Failed to delete playlist.", type: "error" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.fetchPlaylists).not.toHaveBeenCalled();
  });

  it("cancelling the prompt deletes nothing", async () => {
    const { user } = await openRowModal();
    await user.click(screen.getByRole("button", { name: "Delete playlist" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.deletePlaylist).not.toHaveBeenCalled();
  });
});

describe("PlaylistManager header and toolbar (#765)", () => {
  it("shows the title and count in the shared header", () => {
    renderWithProviders(<PlaylistManager />);
    expect(screen.getByRole("heading", { level: 1, name: "Playlists" })).toBeTruthy();
    expect(screen.getByTestId("page-header-count").textContent).toBe("1");
  });

  it("filters by name and updates the count", async () => {
    const { user } = renderWithProviders(<PlaylistManager />);
    await user.type(screen.getByRole("textbox", { name: "Search playlists" }), "zzz");
    expect(screen.getByText('No playlists match "zzz"')).toBeTruthy();
    expect(screen.getByTestId("page-header-count").textContent).toBe("0");
  });

  it("opens the file picker from the header and toolbar Import buttons", async () => {
    const { user, container } = renderWithProviders(<PlaylistManager />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Import playlist", hidden: true }));
    await user.click(screen.getByRole("button", { name: /^Import$/, hidden: true }));
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("remembers the Cards/List choice", async () => {
    localStorage.clear();
    const { user } = renderWithProviders(<PlaylistManager />);
    await user.click(screen.getByRole("button", { name: "LIST", hidden: true }));
    expect(localStorage.getItem("playlistsViewMode")).toBe("list");
    expect(screen.getByRole("button", { name: "LIST", hidden: true }).getAttribute("aria-pressed")).toBe("true");
  });

  it("omits the count while loading", () => {
    providerState.loading = true;
    renderWithProviders(<PlaylistManager />);
    expect(screen.queryByTestId("page-header-count")).toBeNull();
  });

  it("offers Import JSON from the empty state", async () => {
    providerState.playlists = [];
    const { user, container } = renderWithProviders(<PlaylistManager />);
    const click = vi.spyOn(container.querySelector('input[type="file"]') as HTMLInputElement, "click");
    await user.click(screen.getByRole("button", { name: "Import JSON" }));
    expect(click).toHaveBeenCalled();
  });

  it("lays playlists out in one column in list view", async () => {
    const { user } = renderWithProviders(<PlaylistManager />);
    await user.click(screen.getByRole("button", { name: "LIST", hidden: true }));
    expect(screen.getByText("Late Night")).toBeTruthy();
  });
});

describe("PlaylistManager month grouping (#766)", () => {
  it("groups playlists under month dividers, newest first, with counts", () => {
    providerState.playlists = [
      { id: 1, name: "Old", tracks: [], created_at: "2026-01-05T12:00:00" },
      { id: 2, name: "New", tracks: [], created_at: "2026-08-10T12:00:00" },
      { id: 3, name: "Gig", tracks: [], created_at: "2026-08-02T12:00:00", set: { status: "performed", collaborators: [] } },
    ];
    renderWithProviders(<PlaylistManager />);
    expect(screen.getAllByTestId("month-tab").map((el) => el.textContent)).toEqual(["AUG 2026", "JAN 2026"]);
    expect(screen.getAllByTestId("month-count").map((el) => el.textContent)).toEqual([
      "2 playlists · 1 set",
      "1 playlist",
    ]);
    expect(screen.getAllByTestId("playlist-day").map((el) => el.textContent)).toEqual(["MON 10", "SUN 2", "MON 5"]);
    expect(screen.getAllByTestId("timeline-day")[0].textContent).toBe("10MON");
  });
});
