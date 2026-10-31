// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { SpinListItem } from "./spinSummary";

const mocks = vi.hoisted(() => ({
  deleteSpin: vi.fn(),
  toast: vi.fn(),
  menu: null as null | { label: string; onEdit: () => void; onDelete: () => Promise<void> },
  dialogOpen: false,
}));
vi.mock("@/hooks/useSpinsQuery", () => ({
  useSpinMutations: () => ({ deleteSpin: mocks.deleteSpin, deleteSpinPending: false }),
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));
vi.mock("./SpinActionsMenu", () => ({
  default: (props: NonNullable<typeof mocks.menu>) => {
    mocks.menu = props;
    return <button onClick={props.onEdit}>Edit {props.label}</button>;
  },
}));
vi.mock("./SpinFormDialog", () => ({
  default: ({ open }: { open: boolean }) => {
    mocks.dialogOpen = open;
    return null;
  },
}));

import SpinSessionActions from "./SpinSessionActions";

const item = {
  session: { id: 9, friend_id: 7, release_id: "r1", selection_mode: "tracks" },
  selections: [],
  track_events: [],
  derived: { is_full_album_spin: false },
} as unknown as SpinListItem;

beforeEach(() => {
  mocks.deleteSpin.mockReset();
  mocks.toast.mockReset();
  mocks.dialogOpen = false;
});

describe("SpinSessionActions", () => {
  it("opens the edit dialog for the spin", async () => {
    const { user } = renderWithProviders(<SpinSessionActions item={item} />);
    expect(mocks.dialogOpen).toBe(false);
    await user.click(screen.getByRole("button", { name: "Edit No tracks recorded" }));
    expect(mocks.dialogOpen).toBe(true);
  });

  it("deletes the spin session and says so", async () => {
    mocks.deleteSpin.mockResolvedValue(undefined);
    renderWithProviders(<SpinSessionActions item={item} />);
    await mocks.menu?.onDelete();
    expect(mocks.deleteSpin).toHaveBeenCalledWith(9);
    expect(mocks.toast).toHaveBeenCalledWith({ title: "Spin deleted", type: "success" });
  });

  it("reports a failed delete and keeps the prompt open", async () => {
    mocks.deleteSpin.mockRejectedValueOnce(new Error("nope")).mockRejectedValueOnce("odd");
    renderWithProviders(<SpinSessionActions item={item} />);
    await expect(mocks.menu?.onDelete()).rejects.toThrow("nope");
    expect(mocks.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Failed to delete spin", description: "nope" }),
    );
    await expect(mocks.menu?.onDelete()).rejects.toBe("odd");
    expect(mocks.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: "Unknown error" }),
    );
  });
});
