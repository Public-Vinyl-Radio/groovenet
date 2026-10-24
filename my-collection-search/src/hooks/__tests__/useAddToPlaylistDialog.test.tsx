// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Playlist, Track } from "@/types/track";

const api = vi.hoisted(() => ({ updatePlaylist: vi.fn(), importPlaylist: vi.fn() }));
vi.mock("@/services/internalApi/playlists", () => api);
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: vi.fn() } }));
// The dialogs are only built as elements here, never rendered.
vi.mock("@/components/PlaylistSelectionDialog", () => ({ default: () => null }));
vi.mock("@/components/NamePlaylistDialog", () => ({ default: () => null }));

import { useAddToPlaylistDialog } from "../useAddToPlaylistDialog";
import { toaster } from "@/components/ui/toaster";

const track = { track_id: "t1", friend_id: 1, title: "Blue" } as Track;
const playlist = (tracks: Playlist["tracks"] = []) =>
  ({ id: 7, name: "Sunday", tracks }) as Playlist;

function setup() {
  const onAdded = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useAddToPlaylistDialog({ onAdded }), { wrapper });
  const choose = (target: Playlist) => {
    act(() => result.current.openForTrack(track));
    act(() => result.current.playlistDialog.props.onPlaylistSelect(target));
  };
  return { onAdded, choose, result };
}

describe("useAddToPlaylistDialog onAdded", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs once the track is in the playlist", async () => {
    api.updatePlaylist.mockResolvedValue(undefined);
    const { onAdded, choose } = setup();
    choose(playlist());
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(track));
  });

  it("runs after creating a new playlist with the track", async () => {
    api.importPlaylist.mockResolvedValue(undefined);
    const { onAdded, result } = setup();
    act(() => result.current.openForTrack(track));
    act(() => result.current.playlistDialog.props.onCreateNew("Monday"));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(track));
  });

  it("does not run when opening the dialog alone", () => {
    const { onAdded, result } = setup();
    act(() => result.current.openForTrack(track));
    expect(onAdded).not.toHaveBeenCalled();
  });

  it.each([
    ["the save fails", () => api.updatePlaylist.mockRejectedValue(new Error("offline")), playlist()],
    ["the track is already there", () => {}, playlist([{ track_id: "t1", friend_id: 1, position: 0 }])],
  ])("does not run when %s", async (_label, arrange, target) => {
    arrange();
    const { onAdded, choose } = setup();
    choose(target);
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }))
    );
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe("useAddToPlaylistDialog with several tracks", () => {
  beforeEach(() => vi.clearAllMocks());
  const second = { track_id: "t2", friend_id: 1, title: "Red" } as Track;

  it("adds every track not already in the playlist and reports each", async () => {
    api.updatePlaylist.mockResolvedValue(undefined);
    const { onAdded, result } = setup();
    act(() => result.current.openForTracks([track, second], "Blue Lines"));
    expect(result.current.playlistDialog.props.title).toBe('Add "Blue Lines" to Playlist');
    act(() => result.current.playlistDialog.props.onPlaylistSelect(playlist([{ track_id: "t1", friend_id: 1, position: 0 }])));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded).toHaveBeenCalledWith(second);
    expect(api.updatePlaylist).toHaveBeenCalledWith(7, {
      tracks: [
        { track_id: "t1", friend_id: 1, position: 0 },
        { track_id: "t2", friend_id: 1 },
      ],
    });
  });

  it("says so when none of them is new", async () => {
    const { onAdded, result } = setup();
    act(() => result.current.openForTracks([track, second]));
    expect(result.current.playlistDialog.props.title).toBe('Add "2 tracks" to Playlist');
    act(() =>
      result.current.playlistDialog.props.onPlaylistSelect(
        playlist([
          { track_id: "t1", friend_id: 1, position: 0 },
          { track_id: "t2", friend_id: 1, position: 1 },
        ])
      )
    );
    await waitFor(() =>
      expect(toaster.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'These tracks are already in playlist "Sunday"', type: "error" })
      )
    );
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("creates a playlist from all of them, and ignores an empty list", async () => {
    api.importPlaylist.mockResolvedValue(undefined);
    const { onAdded, result } = setup();
    act(() => result.current.openForTracks([]));
    expect(result.current.playlistDialog.props.open).toBe(false);
    act(() => result.current.openForTracks([track, second]));
    act(() => result.current.playlistDialog.props.onCreateNew("Monday"));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2));
    expect(api.importPlaylist).toHaveBeenCalledWith("Monday", [
      { track_id: "t1", friend_id: 1 },
      { track_id: "t2", friend_id: 1 },
    ]);
    expect(toaster.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Created "Monday" with 2 tracks' }));
  });
});
