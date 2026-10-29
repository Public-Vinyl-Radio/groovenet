// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import ConfirmDialog from "./ConfirmDialog";

function renderConfirm(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const rendered = renderWithProviders(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete thing"
      body="Gone for good."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      pending={false}
      {...props}
    />,
  );
  return { ...rendered, onOpenChange, onConfirm };
}

describe("ConfirmDialog", () => {
  it("is an alertdialog with a one-sentence body", async () => {
    renderConfirm();
    const dialog = await screen.findByRole("alertdialog", { name: "Delete thing" });
    expect(within(dialog).getByText("Gone for good.")).toBeTruthy();
  });

  it("offers a non-destructive confirm too", async () => {
    renderConfirm({ destructive: false, confirmLabel: "Apply" });
    expect(await screen.findByRole("button", { name: "Apply" })).toBeTruthy();
  });

  it("confirms and then closes", async () => {
    const { user, onConfirm, onOpenChange } = renderConfirm();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open when the confirm rejects", async () => {
    const { user, onOpenChange } = renderConfirm({
      onConfirm: vi.fn().mockRejectedValue(new Error("x")),
    });
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("cancels", async () => {
    const { user, onOpenChange, onConfirm } = renderConfirm();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
