// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { chooseMenuItem, renderWithProviders } from "@/test/renderWithProviders";
import SpinActionsMenu from "./SpinActionsMenu";

afterEach(() => vi.clearAllMocks());

function setup(onDelete = vi.fn().mockResolvedValue(undefined)) {
  const onEdit = vi.fn();
  const rendered = renderWithProviders(
    <SpinActionsMenu label="A1 Blue" onEdit={onEdit} onDelete={onDelete} deleting={false} />,
  );
  // [0] opens the phone modal, [1] the desktop menu (hidden in jsdom).
  const [sheetButton, menuButton] = screen.getAllByRole("button", {
    name: "Spin actions",
    hidden: true,
  });
  return { ...rendered, onEdit, onDelete, sheetButton, menuButton };
}

describe("SpinActionsMenu", () => {
  it("edits from the desktop menu", async () => {
    const { user, onEdit, menuButton } = setup();

    await chooseMenuItem(user, menuButton, /Edit spin/);

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("edits from the phone modal", async () => {
    const { user, onEdit, sheetButton } = setup();

    await user.click(sheetButton);
    await user.click(await screen.findByText("Edit spin", { selector: "p" }));

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("deletes from the sheet only once confirmed", async () => {
    const { user, onDelete, sheetButton } = setup();

    await user.click(sheetButton);
    await user.click(await screen.findByText("Delete spin"));
    const prompt = await screen.findByRole("alertdialog");
    expect(within(prompt).getByText("A1 Blue")).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(within(prompt).getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("keeps the prompt open when the delete fails", async () => {
    const { user, menuButton } = setup(vi.fn().mockRejectedValue(new Error("nope")));

    await chooseMenuItem(user, menuButton, /Delete spin/);
    const prompt = await screen.findByRole("alertdialog");
    await user.click(within(prompt).getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(within(prompt).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});

it("gives the phone kebab a 44px square target", () => {
  const { sheetButton } = setup();
  expect(getComputedStyle(sheetButton).width).toBe("44px");
  expect(getComputedStyle(sheetButton).height).toBe("44px");
});
