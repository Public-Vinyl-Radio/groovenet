// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Playlist } from "@/types/track";

const household = vi.hoisted(() => vi.fn());
vi.mock("@/providers/HouseholdProvider", () => ({ useHousehold: household }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const playlists = [
  { id: 1, name: "Mine shared", owner_id: "me", owner_name: "Adam", visibility: "household" },
  { id: 2, name: "Mine private", owner_id: "me", owner_name: "Adam", visibility: "private" },
  { id: 3, name: "Sam's mix", owner_id: "sam", owner_name: "Sam", visibility: "household" },
].map((p) => ({ ...p, tracks: [], created_at: "2026-01-01T00:00:00Z" })) as unknown as Playlist[];
vi.mock("@/providers/PlaylistsProvider", () => ({
  usePlaylists: () => ({
    playlists,
    playlistsLoading: false,
    loadingPlaylists: null,
    fetchPlaylists: vi.fn(),
  }),
}));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  usePlaybackPlayer: () => ({ replacePlaylist: vi.fn(), appendToQueue: vi.fn() }),
}));
vi.mock("@/hooks/useFriendsQuery", () => ({ useFriendsQuery: () => ({ friends: [] }) }));
vi.mock("@/hooks/useDeletePlaylistMutation", () => ({
  useDeletePlaylistMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null, toaster: { create: vi.fn() } }));
vi.mock("@/components/FriendSelectDialog", () => ({ default: () => null }));

import PlaylistManager from "./PlaylistManager";

const users = [
  { id: "me", name: "Adam", is_owner: true },
  { id: "sam", name: "Sam", is_owner: false },
];
const names = () =>
  ["Mine shared", "Mine private", "Sam's mix"].filter((n) => screen.queryAllByText(n).length > 0);

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("PlaylistManager owner filter (#1284)", () => {
  it("filters by All, Mine and another profile, and tags the owner", async () => {
    household.mockReturnValue({ data: { users, current: { id: "me" }, selected: true } });
    const { user } = renderWithProviders(<PlaylistManager />);
    const group = screen.getByRole("group", { name: "Show playlists by owner" });
    expect(group.textContent).toBe("AllMineSam");
    expect(names()).toEqual(["Mine shared", "Mine private", "Sam's mix"]);
    expect(screen.getAllByTestId("playlist-owner-tag")[0].textContent).toBe("Sam");
    expect(screen.getAllByTestId("playlist-private-tag").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Mine" }));
    expect(names()).toEqual(["Mine shared", "Mine private"]);
    expect(screen.getByRole("button", { name: "Mine" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Sam" }));
    expect(names()).toEqual(["Sam's mix"]);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(names()).toHaveLength(3);
  });

  it("says so when a profile has no playlists", async () => {
    household.mockReturnValue({
      data: { users: [...users, { id: "kim", name: "Kim" }], current: { id: "me" } },
    });
    const { user } = renderWithProviders(<PlaylistManager />);
    await user.click(screen.getByRole("button", { name: "Kim" }));
    expect(screen.getByText("No playlists here yet")).toBeTruthy();
  });

  it("offers no filter and no tags to a single-profile household", () => {
    household.mockReturnValue({ data: { users: users.slice(0, 1), current: { id: "me" } } });
    renderWithProviders(<PlaylistManager />);
    expect(screen.queryByRole("group", { name: "Show playlists by owner" })).toBeNull();
    expect(screen.queryByTestId("playlist-owner-tag")).toBeNull();
    expect(screen.queryByTestId("playlist-private-tag")).toBeNull();
  });
});
