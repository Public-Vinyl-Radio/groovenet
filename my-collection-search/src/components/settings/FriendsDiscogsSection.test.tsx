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
  useVerifyManifests: () => ({ mutateAsync: mocks.verifyMutateAsync, isPending: mocks.verifyIsPending }),
  useCleanupManifests: () => ({ mutateAsync: mocks.cleanupMutateAsync, isPending: false }),
  useDeleteReleases: () => ({ mutateAsync: mocks.deleteMutateAsync, isPending: false }),
}));
vi.mock("@/hooks/useFriendsSync", () => ({
  useFriendsSync: () => ({ handleRemoveFriend: mocks.handleRemoveFriend }),
}));

import FriendsDiscogsSection from "./FriendsDiscogsSection";

describe("FriendsDiscogsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friends = [];
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
    const dialog = await screen.findByRole("dialog", { name: "Remove Friend" });
    expect(mocks.handleRemoveFriend).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Remove Friend" }));

    expect(mocks.handleRemoveFriend).toHaveBeenCalledWith("dj-friend");
  });
});
