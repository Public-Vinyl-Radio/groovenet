// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import RecordCopyMenu from "./RecordCopyMenu";

async function openSheet(props: Partial<React.ComponentProps<typeof RecordCopyMenu>> = {}) {
  const onLogCare = vi.fn();
  const onEdit = vi.fn();
  const view = renderWithProviders(
    <RecordCopyMenu label="Copy B" onLogCare={onLogCare} onEdit={onEdit} {...props} />,
  );
  // [0] opens the phone modal, [1] the desktop menu (both render in jsdom).
  await view.user.click(screen.getAllByRole("button", { name: "Copy actions", hidden: true })[0]);
  return { ...view, onLogCare, onEdit, dialog: await screen.findByRole("dialog") };
}

describe("RecordCopyMenu phone modal", () => {
  it("names the copy and offers log care and edit", async () => {
    const { dialog } = await openSheet();
    expect(within(dialog).getByText("Copy B")).toBeTruthy();
    expect(within(dialog).getByText("Log care")).toBeTruthy();
    expect(within(dialog).queryByText("Danger")).toBeNull();
  });

  it("runs log care and closes", async () => {
    const { user, dialog, onLogCare } = await openSheet();
    await user.click(within(dialog).getByText("Log care"));
    expect(onLogCare).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("runs edit", async () => {
    const { user, dialog, onEdit } = await openSheet();
    await user.click(within(dialog).getByText("Edit"));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("removes a non-default copy from the danger group", async () => {
    const onRemove = vi.fn();
    const { user, dialog } = await openSheet({ onRemove });
    expect(within(dialog).getByText("Danger")).toBeTruthy();
    await user.click(within(dialog).getByText("Remove copy"));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

it("gives the phone kebab a 44px square target", async () => {
  await openSheet();
  const trigger = screen.getAllByRole("button", { name: "Copy actions", hidden: true })[0];
  expect(getComputedStyle(trigger).width).toBe("44px");
  expect(getComputedStyle(trigger).height).toBe("44px");
});
