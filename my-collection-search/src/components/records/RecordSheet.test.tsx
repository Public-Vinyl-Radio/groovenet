// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";
import RecordSheet from "./RecordSheet";

afterEach(() => setViewportWidth(1280));

function setup(width: number) {
  setViewportWidth(width);
  const onOpenChange = vi.fn();
  const onSave = vi.fn();
  const view = renderWithProviders(
    <RecordSheet
      open
      onOpenChange={onOpenChange}
      title="Log care"
      saveLabel="Save"
      saving={false}
      onSave={onSave}
    >
      <p>form body</p>
    </RecordSheet>,
  );
  return { ...view, onOpenChange, onSave };
}

describe.each([
  ["phone", 375],
  ["desktop", 1280],
])("RecordSheet on %s", (_name, width) => {
  it("shows the title, body and actions, and saves or cancels", async () => {
    const { user, onSave, onOpenChange } = setup(width);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Log care")).toBeTruthy();
    expect(within(dialog).getByText("form body")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
