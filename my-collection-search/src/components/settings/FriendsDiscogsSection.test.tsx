// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  friends: [] as { username: string }[],
  friendsLoading: false,
  addFriend: vi.fn(),
  addFriendPending: false,
  removeFriendPending: false,
  syncMutate: vi.fn(),
  syncIsPending: false,
  verifyMutateAsync: vi.fn(),
  verifyIsPending: false,
  cleanupMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  handleRemoveFriend: vi.fn(),
  defaultFriend: null as { username: string } | null,
}));

vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: mocks.friends,
    friendsLoading: mocks.friendsLoading,
    addFriend: mocks.addFriend,
    addFriendPending: mocks.addFriendPending,
    removeFriendPending: mocks.removeFriendPending,
  }),
}));
vi.mock("@/hooks/useDiscogsQuery", () => ({
  useSyncDiscogs: () => ({ mutate: mocks.syncMutate, isPending: mocks.syncIsPending }),
  useVerifyManifests: () => ({
    mutateAsync: mocks.verifyMutateAsync,
    isPending: mocks.verifyIsPending,
  }),
  useCleanupManifests: () => ({ mutateAsync: mocks.cleanupMutateAsync, isPending: false }),
  useDeleteReleases: () => ({ mutateAsync: mocks.deleteMutateAsync, isPending: false }),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: mocks.defaultFriend }),
}));
vi.mock("@/hooks/useFriendsSync", () => ({
  useFriendsSync: () => ({ handleRemoveFriend: mocks.handleRemoveFriend }),
}));

import FriendsDiscogsSection from "./FriendsDiscogsSection";

describe("FriendsDiscogsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friends = [];
    mocks.defaultFriend = null;
    mocks.friendsLoading = false;
    mocks.addFriendPending = false;
    mocks.removeFriendPending = false;
    mocks.syncIsPending = false;
    mocks.verifyIsPending = false;
    mocks.verifyMutateAsync.mockResolvedValue({ summary: { totalManifests: 0 }, results: [] });
  });

  it("says so when there are no friends yet", () => {
    renderWithProviders(<FriendsDiscogsSection />);
    expect(screen.getByText("No friends added yet.")).toBeTruthy();
  });

  it("adds a friend from the input", async () => {
    const { user } = renderWithProviders(<FriendsDiscogsSection />);
    const input = screen.getByPlaceholderText("Add friend's username");
    const addButton = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);

    await user.type(input, "dj-friend");
    expect(addButton.disabled).toBe(false);
    await user.click(addButton);

    expect(mocks.addFriend).toHaveBeenCalledWith("dj-friend");
  });

  it("offers a quiet, labelled sync and remove icon button per friend", async () => {
    mocks.friends = [{ username: "dj-friend" }];
    const { user } = renderWithProviders(<FriendsDiscogsSection />);

    const syncButton = screen.getByRole("button", { name: "Sync collection" });
    const removeButton = screen.getByRole("button", { name: "Remove friend" });
    expect(syncButton).toBeTruthy();
    expect(removeButton).toBeTruthy();

    await user.click(syncButton);
    await waitFor(() => expect(mocks.verifyMutateAsync).toHaveBeenCalled());
    // No existing manifests, so sync starts immediately without the verification dialog.
    expect(mocks.syncMutate).toHaveBeenCalledWith({ username: "dj-friend" });
  });

  it("confirms before removing a friend", async () => {
    mocks.friends = [{ username: "dj-friend" }];
    const { user } = renderWithProviders(<FriendsDiscogsSection />);

    await user.click(screen.getByRole("button", { name: "Remove friend" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Friend" });
    expect(mocks.handleRemoveFriend).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove Friend" }));

    expect(mocks.handleRemoveFriend).toHaveBeenCalledWith("dj-friend");
  });

  it("lists the default library with a badge and sync only, no remove", async () => {
    mocks.friends = [{ username: "dj-friend" }];
    const { user } = renderWithProviders(<FriendsDiscogsSection />);

    expect(screen.getByText("Default library")).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    // One remove button: the friend's, not the default library's.
    expect(screen.getAllByRole("button", { name: "Remove friend" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Sync default library" }));
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalledWith({ username: undefined }));
  });

  it("syncs the default library after continuing past manifest verification", async () => {
    mocks.verifyMutateAsync.mockResolvedValue({ summary: { totalManifests: 1 }, results: [] });
    const { user } = renderWithProviders(<FriendsDiscogsSection />);

    await user.click(screen.getByRole("button", { name: "Sync default library" }));
    expect(mocks.syncMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    const buttons = within(dialog).getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalledWith({ username: undefined }));
  });

  it("spins only the row being synced and disables the rest", async () => {
    mocks.friends = [{ username: "dj-friend" }, { username: "other" }];
    const { user, rerender } = renderWithProviders(<FriendsDiscogsSection />);
    const syncButtons = () =>
      screen.getAllByRole("button", {
        name: /Sync (collection|default library)/,
      }) as HTMLButtonElement[];

    // Rows in order: default, dj-friend, other. Sync the middle one.
    await user.click(syncButtons()[1]);
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalled());
    mocks.syncIsPending = true;
    rerender(<FriendsDiscogsSection />);

    const buttons = syncButtons();
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect(buttons.map((b) => b.hasAttribute("data-loading"))).toEqual([false, true, false]);
  });

  it("badges the friend row that is the default library instead of listing it twice", async () => {
    mocks.friends = [{ username: "owner" }, { username: "dj-friend" }];
    mocks.defaultFriend = { username: "owner" };
    const { user } = renderWithProviders(<FriendsDiscogsSection />);

    expect(screen.queryByText("Default library")).toBeNull();
    expect(screen.getAllByText("default")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Remove friend" })).toHaveLength(1);

    await user.click(screen.getAllByRole("button", { name: "Sync collection" })[0]);
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalledWith({ username: "owner" }));
  });
});
