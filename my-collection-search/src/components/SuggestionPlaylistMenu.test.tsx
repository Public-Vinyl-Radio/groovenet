// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SuggestionRow from "./SuggestionRow";
import SuggestionPlaylistMenu from "./SuggestionPlaylistMenu";
import type { Track } from "@/types/track";
import { setAnalyticsProvider } from "@/lib/analytics/client";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import { queryKeys } from "@/lib/queryKeys";

const api = vi.hoisted(() => ({
  fetchPlaylists: vi.fn(),
  fetchPlaylistTrackIds: vi.fn(),
  updatePlaylist: vi.fn(),
  importPlaylist: vi.fn(),
}));
vi.mock("@/services/internalApi/playlists", () => api);
let analytics: MemoryAnalyticsProvider;
const track = { track_id: "suggested", friend_id: 4, title: "Suggested", artist: "A" } as Track;
const seed = { ...track, track_id: "seed", title: "Seed" };
const playlists = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1,
  name: `Playlist ${i + 1}`,
  created_at: `2026-10-0${i + 1}`,
  tracks: [],
}));
beforeEach(() => {
  vi.clearAllMocks();
  analytics = new MemoryAnalyticsProvider();
  setAnalyticsProvider(analytics);
  api.fetchPlaylists.mockResolvedValue(playlists);
  api.fetchPlaylistTrackIds.mockResolvedValue({ tracks: [{ track_id: "keep", friend_id: 2 }] });
  api.updatePlaylist.mockResolvedValue({});
  api.importPlaylist.mockResolvedValue({ id: 99 });
});
function Example() {
  const [added, setAdded] = React.useState(false);
  return (
    <ul>
      <SuggestionRow
        track={track}
        seed={seed}
        added={added}
        addAction={<SuggestionPlaylistMenu track={track} onAdded={() => setAdded(true)} />}
      />
    </ul>
  );
}
async function open() {
  const result = renderWithProviders(<Example />);
  await result.user.click(screen.getByRole("button", { name: "Add Suggested to playlist" }));
  await screen.findByText("Recent playlists");
  return result;
}

describe("Suggestion playlist menu", () => {
  it("opens in place with five recent playlists and adds without a dialog", async () => {
    const { user, queryClient } = await open();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("button", { name: "Playlist 7" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Playlist 1" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /^Playlist / }).map((button) => button.textContent),
    ).toEqual(["Playlist 7", "Playlist 6", "Playlist 5", "Playlist 4", "Playlist 3"]);
    await user.click(screen.getByRole("button", { name: "Playlist 7" }));
    expect(await screen.findByText("ADDED")).toBeTruthy();
    expect(api.updatePlaylist).toHaveBeenCalledWith(7, {
      tracks: [
        { track_id: "keep", friend_id: 2 },
        { track_id: "suggested", friend_id: 4 },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.playlistTrackIds(7) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.playlists() });
    expect(analytics.events).toContainEqual(
      expect.objectContaining({
        event: "track_added_to_playlist",
        properties: {
          track_id: "suggested",
          playlist_id: 7,
          is_new_playlist: false,
        },
      }),
    );
    expect(screen.queryByRole("button", { name: "Add Suggested to playlist" })).toBeNull();
  });
  it("searches all playlists in the same picker", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "All playlists…" }));
    await user.type(screen.getByRole("textbox", { name: "Search playlists" }), "playlist 1");
    await user.click(await screen.findByRole("button", { name: "Playlist 1" }));
    expect(await screen.findByText("ADDED")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("creates a named playlist in place", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "New playlist…" }));
    expect(
      (screen.getByRole("button", { name: "Create playlist" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Playlist name" }), "  New set  ");
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(await screen.findByText("ADDED")).toBeTruthy();
    expect(api.importPlaylist).toHaveBeenCalledWith("New set", [
      { track_id: "suggested", friend_id: 4 },
    ]);
    expect(analytics.events).toContainEqual(
      expect.objectContaining({
        event: "track_added_to_playlist",
        properties: expect.objectContaining({ is_new_playlist: true }),
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("recognizes an existing exact reference without appending a duplicate", async () => {
    api.fetchPlaylistTrackIds.mockResolvedValue({
      tracks: [{ track_id: track.track_id, friend_id: 4 }],
    });
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Playlist 7" }));
    expect(await screen.findByText("ADDED")).toBeTruthy();
    expect(api.updatePlaylist).not.toHaveBeenCalled();
  });
  it("keeps references for the same track in other libraries", async () => {
    api.fetchPlaylistTrackIds.mockResolvedValue({
      tracks: [{ track_id: track.track_id, friend_id: 2 }],
    });
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Playlist 7" }));
    await screen.findByText("ADDED");
    expect(api.updatePlaylist).toHaveBeenCalledWith(7, {
      tracks: [
        { track_id: track.track_id, friend_id: 2 },
        { track_id: track.track_id, friend_id: 4 },
      ],
    });
  });
  it("shows failed adds in place and allows retry", async () => {
    api.updatePlaylist.mockRejectedValueOnce(new Error("offline"));
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Playlist 7" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("ADDED")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Playlist 7" }));
    expect(await screen.findByText("ADDED")).toBeTruthy();
  });
  it("reports an empty list", async () => {
    api.fetchPlaylists.mockResolvedValue([]);
    await open();
    expect(await screen.findByText("No playlists found.")).toBeTruthy();
  });
  it("shows playlist load errors", async () => {
    api.fetchPlaylists.mockRejectedValue(new Error("offline"));
    await open();
    expect(await screen.findByText("Could not load playlists.")).toBeTruthy();
  });
  it("shows loading and supports cancel and reopen", async () => {
    api.fetchPlaylists.mockReturnValue(new Promise(() => {}));
    const { user } = await open();
    expect(screen.getByText("Loading playlists...")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Add Suggested to playlist" }));
    expect(await screen.findByText("Recent playlists")).toBeTruthy();
  });
  it("rejects tracks without a library", async () => {
    const { user } = renderWithProviders(
      <SuggestionPlaylistMenu
        track={{ ...track, friend_id: undefined } as unknown as Track}
        onAdded={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add Suggested to playlist" }));
    await user.click(await screen.findByRole("button", { name: "Playlist 7" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(api.fetchPlaylistTrackIds).not.toHaveBeenCalled();
  });
});

it("dismisses with Escape and leaves the row available", async () => {
  const { user } = await open();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  expect(screen.getByRole("button", { name: "Add Suggested to playlist" })).toBeTruthy();
});
