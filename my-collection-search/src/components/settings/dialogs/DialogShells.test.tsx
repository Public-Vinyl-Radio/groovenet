// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import DiscogsSyncDialog from "./DiscogsSyncDialog";
import RemoveFriendDialog from "./RemoveFriendDialog";
import ManifestVerificationDialog from "./ManifestVerificationDialog";
import RemovedReleasesDialog from "./RemovedReleasesDialog";

const state = vi.hoisted(() => ({
  closeSync: vi.fn(),
  closeRemove: vi.fn(),
  stream: { lines: [] as string[], done: false, error: "" },
}));
vi.mock("@/providers/SettingsDialogProvider", () => ({
  useSettingsDialogs: () => ({
    discogsSyncOpen: true,
    setDiscogsSyncOpen: state.closeSync,
    removeFriendOpen: true,
    setRemoveFriendOpen: state.closeRemove,
  }),
}));
vi.mock("@/providers/SyncStreamsProvider", () => ({
  useSyncStreams: () => ({ discogs: state.stream, removeFriend: state.stream }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.stream = { lines: [], done: false, error: "" };
});

it.each([
  ["Discogs Sync Progress", DiscogsSyncDialog, state.closeSync, "Waiting for sync output..."],
  [
    "Remove Friend Progress",
    RemoveFriendDialog,
    state.closeRemove,
    "Waiting for removal output...",
  ],
] as const)(
  "preserves %s streaming output, errors and close controls",
  async (title, Component, close, waiting) => {
    const { user, rerender } = renderWithProviders(<Component />);
    expect(await screen.findByRole("dialog", { name: title })).toBeTruthy();
    expect(screen.getByText(waiting)).toBeTruthy();
    // The progress footer waits for completion; the shared close retains dismissal.
    expect(
      (screen.getAllByRole("button", { name: "Close" }).at(-1)! as HTMLButtonElement).disabled,
    ).toBe(true);
    state.stream = {
      lines: ["Working...", "Complete"],
      done: true,
      error: "Stream failed",
    };
    rerender(<Component />);
    expect(screen.getByText("Working...")).toBeTruthy();
    expect(screen.getByText("Stream failed")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(close).toHaveBeenCalledWith(false);
  },
);

it("keeps manifest cleanup actions and blocks dismissal while cleanup is pending", async () => {
  const onOpenChange = vi.fn();
  const onCleanup = vi.fn();
  const onContinue = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    onCleanup,
    onContinue,
    cleanupPending: false,
    results: [
      {
        username: "Library",
        totalReleaseIds: 2,
        missingFiles: ["42"],
        validFiles: ["41"],
      },
    ],
  };
  const { user, rerender } = renderWithProviders(<ManifestVerificationDialog {...props} />);
  await user.click(await screen.findByRole("button", { name: "Clean Up Manifest" }));
  expect(onCleanup).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Continue Anyway" }));
  expect(onContinue).toHaveBeenCalledOnce();
  rerender(<ManifestVerificationDialog {...props} cleanupPending />);
  await user.keyboard("{Escape}");
  expect(onOpenChange).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
});

it("offers sync when every manifest file is valid", async () => {
  const onContinue = vi.fn();
  const { user } = renderWithProviders(
    <ManifestVerificationDialog
      open
      onOpenChange={vi.fn()}
      onCleanup={vi.fn()}
      onContinue={onContinue}
      cleanupPending={false}
      results={[]}
    />,
  );
  expect(await screen.findByText("All files verified")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Clean Up Manifest" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Proceed with Sync" }));
  expect(onContinue).toHaveBeenCalledOnce();
});

it("preserves removed-release choices and blocks dismissal during deletion", async () => {
  const onDelete = vi.fn();
  const onSkip = vi.fn();
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    onDelete,
    onSkip,
    username: "Library",
    removedIds: ["42", "43"],
    deletePending: false,
  };
  const { user, rerender } = renderWithProviders(<RemovedReleasesDialog {...props} />);
  await user.click(await screen.findByRole("button", { name: "Keep Files" }));
  expect(onSkip).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Delete 2 Releases" }));
  expect(onDelete).toHaveBeenCalledOnce();
  rerender(<RemovedReleasesDialog {...props} deletePending />);
  await user.keyboard("{Escape}");
  expect(onOpenChange).not.toHaveBeenCalled();
});

it("cancels manifest verification from its footer", async () => {
  const onOpenChange = vi.fn();
  const { user } = renderWithProviders(
    <ManifestVerificationDialog
      open
      onOpenChange={onOpenChange}
      onCleanup={vi.fn()}
      onContinue={vi.fn()}
      cleanupPending={false}
      results={[]}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
