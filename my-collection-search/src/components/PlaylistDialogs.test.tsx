// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import NamePlaylistDialog from "./NamePlaylistDialog";
import FriendSelectDialog from "./FriendSelectDialog";
import PlaylistSelectionDialog from "./PlaylistSelectionDialog";

const api = vi.hoisted(() => ({
  fetchFriends: vi.fn(),
  fetchPlaylists: vi.fn(),
}));
vi.mock("@/services/internalApi/friends", () => ({
  fetchFriends: api.fetchFriends,
}));
vi.mock("@/services/internalApi/playlists", () => ({
  fetchPlaylists: api.fetchPlaylists,
}));

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchFriends.mockResolvedValue([{ id: 7, username: "Library" }]);
  api.fetchPlaylists.mockResolvedValue([{ id: 1, name: "Night set", tracks: [] }]);
});

describe("playlist dialog migrations", () => {
  it("passes the edited name on confirmation", async () => {
    const onConfirm = vi.fn();
    const setName = vi.fn();
    const { user } = renderWithProviders(
      <NamePlaylistDialog
        open
        name="Original"
        setName={setName}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        trackCount={3}
      />,
    );
    const input = await screen.findByPlaceholderText("Playlist name");
    await user.clear(input);
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.type(input, "Updated");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(setName).toHaveBeenCalledWith("Updated");
    expect(onConfirm).toHaveBeenCalledWith("Updated");
  });

  it("cancels a name edit from the shared close button", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(
      <NamePlaylistDialog
        open
        name="Original"
        setName={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await user.type(await screen.findByPlaceholderText("Playlist name"), " draft");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("Playlist name") as HTMLInputElement).value).toBe(
      "Original",
    );
  });

  it("loads libraries and preserves the selected library on import", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { user } = renderWithProviders(
      <FriendSelectDialog
        open
        selectedFriendId={7}
        setSelectedFriendId={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        trackCount={2}
      />,
    );
    expect(await screen.findByRole("dialog", { name: "Select Library" })).toBeTruthy();
    await screen.findByText("Library");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("filters playlist choices and offers creation with that name", async () => {
    const onCreateNew = vi.fn();
    const onPlaylistSelect = vi.fn();
    const { user } = renderWithProviders(
      <PlaylistSelectionDialog
        open
        onClose={vi.fn()}
        onPlaylistSelect={onPlaylistSelect}
        onCreateNew={onCreateNew}
      />,
    );
    const search = await screen.findByPlaceholderText("Search playlists...");
    await user.click(await screen.findByRole("button", { name: /Night set/ }));
    expect(onPlaylistSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    await user.type(search, "New set");
    expect(screen.queryByRole("button", { name: /Night set/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: 'Create "New set"' }));
    expect(onCreateNew).toHaveBeenCalledWith("New set");
  });
});

it("changes the selected library", async () => {
  const setSelectedFriendId = vi.fn();
  const { user } = renderWithProviders(
    <FriendSelectDialog
      open
      selectedFriendId={null}
      setSelectedFriendId={setSelectedFriendId}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await user.click(await screen.findByRole("radio", { name: "Library" }));
  expect(setSelectedFriendId).toHaveBeenCalledWith(7);
});

it("dismisses playlist selection through the shared close button", async () => {
  const onClose = vi.fn();
  const { user } = renderWithProviders(
    <PlaylistSelectionDialog
      open
      onClose={onClose}
      onPlaylistSelect={vi.fn()}
      onCreateNew={vi.fn()}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledOnce();
});
