// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import RetroDialog, { RetroDialogTitle } from "./RetroDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof RetroDialog>> = {}) {
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <RetroDialog open onOpenChange={onOpenChange} title="Delete track" {...props}>
      <p>Body</p>
    </RetroDialog>
  );
  return { ...rendered, onOpenChange };
}

describe("RetroDialog", () => {
  it("is a dialog named by its label strip", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog", { name: "Delete track" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("can be an alertdialog", async () => {
    renderDialog({ role: "alertdialog" });
    expect(await screen.findByRole("alertdialog", { name: "Delete track" })).toBeTruthy();
  });

  it("renders a custom header in place of the title", async () => {
    renderDialog({ title: undefined, header: <RetroDialogTitle>Custom</RetroDialogTitle> });
    expect(await screen.findByRole("dialog", { name: "Custom" })).toBeTruthy();
  });

  it("keeps the close button in the strip's flow, so header buttons are not overlapped", async () => {
    renderDialog({ title: undefined, header: <RetroDialogTitle>Custom</RetroDialogTitle> });
    const close = await screen.findByRole("button", { name: "Close" });
    expect(getComputedStyle(close).position).toBe("static");
  });

  it("closes from the close button and Escape", async () => {
    const { user, onOpenChange } = renderDialog();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it("ignores Escape and disables Close while not dismissible", async () => {
    const { user, onOpenChange } = renderDialog({ dismissible: false });
    const close = await screen.findByRole("button", { name: "Close" });
    expect((close as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
