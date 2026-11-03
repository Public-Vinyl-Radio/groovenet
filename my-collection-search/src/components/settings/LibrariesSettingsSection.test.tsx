// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { LibrariesListResponse } from "@/services/internalApi/friends";

type Friend = { id: number; username: string };

const mocks = vi.hoisted(() => ({
  libraries: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
  defaultFriend: null as Friend | null,
  isSaving: false,
  setFriend: vi.fn(),
  addFriend: vi.fn(),
  handleRemoveFriend: vi.fn(),
  syncMutate: vi.fn(),
  syncIsPending: false,
  onRemovedReleases: undefined as
    undefined | ((data: { removedIds: string[]; username: string }) => void),
  verifyMutateAsync: vi.fn(),
  verifyIsPending: false,
  cleanupMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  discogs: { lines: [] as string[], done: false, error: null as string | null },
  scope: {
    data: { scope: "library" } as unknown,
    isPending: false,
    error: null as Error | null,
  },
  updateMutate: vi.fn(),
  updateIsPending: false,
  toast: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("@/hooks/useLibraries", () => ({
  useLibrariesQuery: () => mocks.libraries,
  useDiscogsUserLookup: (username: string | null) => mocks.lookup(username),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({
    friend: mocks.defaultFriend,
    setFriend: mocks.setFriend,
    isSaving: mocks.isSaving,
  }),
}));
vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({ addFriend: mocks.addFriend }),
}));
vi.mock("@/hooks/useFriendsSync", () => ({
  useFriendsSync: () => ({ handleRemoveFriend: mocks.handleRemoveFriend }),
}));
vi.mock("@/hooks/useDiscogsQuery", () => ({
  useSyncDiscogs: (cb: typeof mocks.onRemovedReleases) => {
    mocks.onRemovedReleases = cb;
    return { mutate: mocks.syncMutate, isPending: mocks.syncIsPending };
  },
  useVerifyManifests: () => ({
    mutateAsync: mocks.verifyMutateAsync,
    isPending: mocks.verifyIsPending,
  }),
  useCleanupManifests: () => ({ mutateAsync: mocks.cleanupMutateAsync, isPending: false }),
  useDeleteReleases: () => ({ mutateAsync: mocks.deleteMutateAsync, isPending: false }),
}));
vi.mock("@/providers/SyncStreamsProvider", () => ({
  useSyncStreams: () => ({ discogs: mocks.discogs }),
}));
vi.mock("@/hooks/useSuggestionScope", () => ({
  useRecommendationSettingsQuery: () => mocks.scope,
  useUpdateRecommendationSettings: () => ({
    mutate: mocks.updateMutate,
    isPending: mocks.updateIsPending,
  }),
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import LibrariesSettingsSection, {
  AddLibraryButton,
  AddLibraryHeaderButton,
  AddLibraryProvider,
} from "./LibrariesSettingsSection";

const LIBRARIES: LibrariesListResponse = {
  account_username: "owner",
  results: [
    {
      id: 1,
      username: "owner",
      is_account: true,
      release_count: 412,
      last_synced_at: "2026-10-01T12:00:00.000Z",
    },
    {
      id: 2,
      username: "collector-2",
      is_account: false,
      release_count: 1233,
      last_synced_at: null,
    },
  ],
};

function Section() {
  return (
    <AddLibraryProvider>
      <AddLibraryButton />
      <AddLibraryHeaderButton />
      <LibrariesSettingsSection />
    </AddLibraryProvider>
  );
}

const rows = () => screen.getAllByTestId("library-row");
const row = (name: string) => rows().find((r) => within(r).queryByText(name))!;
const button = (scope: HTMLElement, name: string | RegExp) =>
  within(scope).getByRole("button", { name, hidden: true }) as HTMLButtonElement;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.libraries = { data: LIBRARIES, isPending: false, isError: false, error: null };
  mocks.defaultFriend = { id: 2, username: "collector-2" };
  mocks.isSaving = false;
  mocks.syncIsPending = false;
  mocks.verifyIsPending = false;
  mocks.discogs = { lines: [], done: false, error: null };
  mocks.scope = { data: { scope: "library" }, isPending: false, error: null };
  mocks.updateIsPending = false;
  mocks.verifyMutateAsync.mockResolvedValue({ summary: { totalManifests: 0 }, results: [] });
  mocks.lookup.mockReturnValue({ data: undefined, isFetching: false, isError: false });
  mocks.addFriend.mockResolvedValue(undefined);
});

describe("LibrariesSettingsSection: the list", () => {
  it("lists your account first with its chip, releases and last sync, and no remove", () => {
    renderWithProviders(<Section />);
    const account = rows()[0];
    expect(within(account).getByText("owner")).toBeTruthy();
    expect(within(account).getByText("Your account")).toBeTruthy();
    expect(within(account).getByText("Your Discogs account, set on the server")).toBeTruthy();
    expect(within(account).getByText("412")).toBeTruthy();
    expect(account.textContent).toContain("412 releases · synced");
    expect(within(account).queryByRole("button", { name: /Remove/, hidden: true })).toBeNull();
    expect(button(account, "Sync owner")).toBeTruthy();
    expect(button(account, "Make default")).toBeTruthy();
  });

  it("marks the default library and offers no Make default on it", () => {
    renderWithProviders(<Section />);
    const friend = row("collector-2");
    expect(within(friend).getByText("Default")).toBeTruthy();
    expect(within(friend).getByText("A friend’s collection")).toBeTruthy();
    expect(within(friend).getByText("1,233")).toBeTruthy();
    expect(within(friend).getByText("Never")).toBeTruthy();
    expect(friend.textContent).toContain("1,233 releases · never synced");
    expect(within(friend).queryByRole("button", { name: "Make default", hidden: true })).toBeNull();
    expect(button(friend, "Remove collector-2")).toBeTruthy();
  });

  it("lists the server's account before its first sync, with sync only", () => {
    mocks.libraries.data = { ...LIBRARIES, results: [LIBRARIES.results[1]] };
    renderWithProviders(<Section />);
    const account = rows()[0];
    expect(within(account).getByText("owner")).toBeTruthy();
    expect(within(account).getByText("Not synced")).toBeTruthy();
    expect(account.textContent).toContain("Not synced yet");
    expect(
      within(account).queryByRole("button", { name: "Make default", hidden: true }),
    ).toBeNull();
    expect(screen.getByText(/Sync owner once to make it a library/)).toBeTruthy();
  });

  it("shows skeletons while loading", () => {
    mocks.libraries = { data: undefined, isPending: true, isError: false, error: null };
    renderWithProviders(<Section />);
    expect(screen.queryAllByTestId("library-row")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Libraries", hidden: true }).children).toHaveLength(3);
  });

  it("says why when the list fails to load", () => {
    mocks.libraries = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("db down"),
    };
    renderWithProviders(<Section />);
    expect(screen.getByText("Couldn't load your libraries: db down")).toBeTruthy();
  });

  it("invites adding one when there are none", () => {
    mocks.libraries.data = { account_username: null, results: [] };
    mocks.defaultFriend = null;
    renderWithProviders(<Section />);
    expect(screen.getByText("No libraries yet. Add one to start syncing.")).toBeTruthy();
  });
});

describe("LibrariesSettingsSection: Make default", () => {
  it("saves at once, says so, and UNDO restores the previous default", async () => {
    const { user, rerender } = renderWithProviders(<Section />);
    await user.click(button(rows()[0], "Make default"));
    expect(mocks.setFriend).toHaveBeenCalledWith({ id: 1, username: "owner" });

    mocks.defaultFriend = { id: 1, username: "owner" };
    rerender(<Section />);
    const status = screen.getByTestId("saved-status");
    expect(status.textContent).toContain("Default set to owner · Saved");

    await user.click(within(status).getByRole("button", { name: "Undo" }));
    expect(mocks.setFriend).toHaveBeenLastCalledWith({ id: 2, username: "collector-2" });
    expect(screen.queryByTestId("saved-status")).toBeNull();
  });

  it("waits for the save before saying Saved", async () => {
    const { user, rerender } = renderWithProviders(<Section />);
    await user.click(button(rows()[0], "Make default"));
    mocks.isSaving = true;
    rerender(<Section />);
    expect(screen.queryByTestId("saved-status")).toBeNull();
  });
});

describe("LibrariesSettingsSection: sync", () => {
  it("syncs the account through the server default, with the progress dialog", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(button(rows()[0], "Sync owner"));
    await waitFor(() =>
      expect(mocks.syncMutate).toHaveBeenCalledWith(
        { username: undefined, showDialog: true },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      ),
    );
  });

  it("shows the syncing row's progress and disables every sync", async () => {
    const { user, rerender } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalled());

    mocks.syncIsPending = true;
    mocks.discogs = {
      lines: ["Found release ID: 1", "Found release ID: 2"],
      done: false,
      error: null,
    };
    rerender(<Section />);
    expect(within(row("collector-2")).getAllByText("Reading collection · 2 found")).toHaveLength(2);
    expect(within(row("owner")).queryByText(/Reading collection/)).toBeNull();
    expect(button(row("owner"), "Sync owner").disabled).toBe(true);
  });

  it("shows the account's progress on its own row", async () => {
    const { user, rerender } = renderWithProviders(<Section />);
    await user.click(button(row("owner"), "Sync owner"));
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalled());
    mocks.syncIsPending = true;
    mocks.discogs = { lines: [], done: false, error: null };
    rerender(<Section />);
    expect(within(row("owner")).getAllByText("Starting sync")).toHaveLength(2);
    expect(within(row("collector-2")).queryByText("Starting sync")).toBeNull();
  });

  it("says Checking while manifests are verified", async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.verifyMutateAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, rerender } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    mocks.verifyIsPending = true;
    rerender(<Section />);
    expect(within(row("collector-2")).getAllByText("Checking")).toHaveLength(2);
    await act(async () => resolve({ summary: { totalManifests: 0 }, results: [] }));
  });

  it("continues past manifest verification on request", async () => {
    mocks.verifyMutateAsync.mockResolvedValue({ summary: { totalManifests: 1 }, results: [] });
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    const dialog = await screen.findByRole("dialog", { name: "Manifest Verification" });
    expect(mocks.syncMutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Proceed with Sync" }));
    expect(mocks.syncMutate).toHaveBeenCalledWith(
      { username: "collector-2", showDialog: true },
      expect.anything(),
    );
  });

  it("starts nothing when verification is cancelled", async () => {
    mocks.verifyMutateAsync.mockResolvedValue({ summary: { totalManifests: 1 }, results: [] });
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    const dialog = await screen.findByRole("dialog", { name: "Manifest Verification" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.syncMutate).not.toHaveBeenCalled();
  });

  it("closes the removed-releases prompt on Escape", async () => {
    const { user } = renderWithProviders(<Section />);
    act(() => mocks.onRemovedReleases?.({ removedIds: ["7"], username: "collector-2" }));
    await screen.findByRole("dialog", { name: "Removed Releases Detected" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cleans manifests up, then syncs", async () => {
    mocks.verifyMutateAsync.mockResolvedValue({
      summary: { totalManifests: 1 },
      results: [
        { username: "collector-2", totalReleaseIds: 2, missingFiles: ["9"], validFiles: [] },
      ],
    });
    mocks.cleanupMutateAsync.mockResolvedValue({ summary: { totalRemoved: 1 } });
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    const dialog = await screen.findByRole("dialog", { name: "Manifest Verification" });
    await user.click(within(dialog).getByRole("button", { name: "Clean Up Manifest" }));
    await waitFor(() => expect(mocks.syncMutate).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Manifest Cleaned" }),
    );
  });

  it("reports a failed cleanup", async () => {
    mocks.verifyMutateAsync.mockResolvedValueOnce({
      summary: { totalManifests: 1 },
      results: [
        { username: "collector-2", totalReleaseIds: 2, missingFiles: ["9"], validFiles: [] },
      ],
    });
    mocks.cleanupMutateAsync.mockRejectedValue(new Error("disk full"));
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Sync collector-2"));
    const dialog = await screen.findByRole("dialog", { name: "Manifest Verification" });
    await user.click(within(dialog).getByRole("button", { name: "Clean Up Manifest" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Cleanup Failed", description: "disk full" }),
      ),
    );
  });

  it("reports a failed verification", async () => {
    const { user } = renderWithProviders(<Section />);
    mocks.verifyMutateAsync.mockRejectedValueOnce("offline");
    await user.click(button(row("owner"), "Sync owner"));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Verification Failed", description: "Unknown error" }),
      ),
    );
  });

  it("offers to delete releases a sync found removed", async () => {
    mocks.deleteMutateAsync.mockResolvedValue({ deletedFromDb: 3 });
    const { user } = renderWithProviders(<Section />);
    act(() => mocks.onRemovedReleases?.({ removedIds: ["7", "8"], username: "collector-2" }));
    const dialog = await screen.findByRole("dialog", { name: "Removed Releases Detected" });
    await user.click(within(dialog).getByRole("button", { name: /Delete 2 Releases/ }));
    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith({
      username: "collector-2",
      releaseIds: ["7", "8"],
    });
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Releases Deleted" }),
      ),
    );
  });

  it("keeps the files when asked, and reports a failed delete", async () => {
    mocks.deleteMutateAsync.mockRejectedValue(new Error("locked"));
    const { user } = renderWithProviders(<Section />);
    act(() => mocks.onRemovedReleases?.({ removedIds: [], username: "collector-2" }));
    expect(screen.queryByRole("dialog", { name: "Removed Releases Detected" })).toBeNull();

    act(() => mocks.onRemovedReleases?.({ removedIds: ["7"], username: "collector-2" }));
    let dialog = await screen.findByRole("dialog", { name: "Removed Releases Detected" });
    await user.click(within(dialog).getByRole("button", { name: /Delete 1 Release/ }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete Failed" })),
    );

    dialog = screen.getByRole("dialog", { name: "Removed Releases Detected" });
    await user.click(within(dialog).getByRole("button", { name: "Keep Files" }));
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Skipped Deletion" }),
    );
  });
});

describe("LibrariesSettingsSection: remove", () => {
  it("asks before removing a library", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Remove collector-2"));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove collector-2" });
    expect(mocks.handleRemoveFriend).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove library" }));
    expect(mocks.handleRemoveFriend).toHaveBeenCalledWith("collector-2");
  });

  it("removes nothing when the prompt is cancelled", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(button(row("collector-2"), "Remove collector-2"));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove collector-2" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.handleRemoveFriend).not.toHaveBeenCalled();
  });
});

describe("LibrariesSettingsSection: add", () => {
  it("opens the modal from either header button, adds, and syncs the new row quietly", async () => {
    mocks.lookup.mockImplementation((username: string | null) => ({
      data: username ? { username, found: true, release_count: 5 } : undefined,
      isFetching: false,
      isError: false,
    }));
    const { user } = renderWithProviders(<Section />);
    await user.click(screen.getAllByRole("button", { name: /Add library/, hidden: true })[1]);
    const dialog = await screen.findByRole("dialog", { name: "Add a library" });
    await user.type(within(dialog).getByRole("textbox"), "collector-5");
    await user.click(within(dialog).getByRole("button", { name: "Look up" }));
    await user.click(within(dialog).getByRole("button", { name: "Add and sync" }));

    expect(mocks.addFriend).toHaveBeenCalledWith("collector-5");
    await waitFor(() =>
      expect(mocks.syncMutate).toHaveBeenCalledWith(
        { username: "collector-5", showDialog: false },
        expect.anything(),
      ),
    );
  });

  it("opens from the desktop ADD LIBRARY button", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(screen.getAllByRole("button", { name: /Add library/, hidden: true })[0]);
    expect(await screen.findByRole("dialog", { name: "Add a library" })).toBeTruthy();
  });

  it("needs its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderWithProviders(<AddLibraryButton />)).toThrow(/AddLibraryProvider/);
  });
});

describe("LibrariesSettingsSection: Suggestions", () => {
  it("names the default library and saves its scope", async () => {
    const { user } = renderWithProviders(<Section />);
    const block = screen.getByTestId("suggestions-block");
    expect(block.textContent).toContain("come from for collector-2.");
    await user.click(within(block).getByText("All libraries"));
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      { friend_id: 2, scope: "all" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    const { onError } = mocks.updateMutate.mock.calls[0][1];
    onError(new Error("nope"));
    onError("nope");
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Failed to save suggestion scope", description: "nope" }),
    );
  });

  it("falls back to the default scope when none is saved", () => {
    mocks.scope = { data: undefined, isPending: false, error: null };
    mocks.updateIsPending = true;
    renderWithProviders(<Section />);
    const block = screen.getByTestId("suggestions-block");
    const radio = within(block).getByRole("radio", { name: "This library", hidden: true });
    expect((radio as HTMLInputElement).checked).toBe(true);
  });

  it("waits for the scope, and says when it can't load", () => {
    mocks.scope = { data: undefined, isPending: true, error: null };
    const { rerender } = renderWithProviders(<Section />);
    expect(within(screen.getByTestId("suggestions-block")).queryByRole("radio")).toBeNull();
    mocks.scope = { data: undefined, isPending: false, error: new Error("x") };
    rerender(<Section />);
    expect(screen.getByText("Failed to load the suggestion scope.")).toBeTruthy();
  });

  it("has no control until there is a default library", () => {
    mocks.defaultFriend = null;
    renderWithProviders(<Section />);
    const block = screen.getByTestId("suggestions-block");
    expect(block.textContent).toContain("come from for the default library.");
    expect(within(block).queryByRole("radio", { hidden: true })).toBeNull();
  });
});
