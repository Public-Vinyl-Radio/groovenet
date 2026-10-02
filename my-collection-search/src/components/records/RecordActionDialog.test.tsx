// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, setViewportWidth } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({ listRecordCopies: vi.fn(), createRecordAction: vi.fn() }));
vi.mock("@/services/internalApi/recordCare", () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import RecordActionDialog from "./RecordActionDialog";

const defaultCopy = {
  id: 3,
  friend_id: 7,
  release_id: "rel",
  is_default: true,
  label: null,
  notes: null,
  inner_sleeve_type: null,
  last_cleaned_at: null,
  deleted_at: null,
  created_at: null,
  updated_at: null,
};
const djCopy = { ...defaultCopy, id: 4, is_default: false, label: "DJ copy" };

function renderDialog(props: Partial<React.ComponentProps<typeof RecordActionDialog>> = {}) {
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <RecordActionDialog
      open
      onOpenChange={onOpenChange}
      releaseId="rel"
      friendId={7}
      albumTitle="Blue Lines"
      {...props}
    />
  );
  return { ...rendered, onOpenChange };
}

const lastBody = () => api.createRecordAction.mock.calls[0][0];

beforeEach(() => {
  api.listRecordCopies.mockResolvedValue({ items: [defaultCopy], overdue_days: 365 });
  api.createRecordAction.mockResolvedValue({});
});
afterEach(() => {
  vi.resetAllMocks();
  setViewportWidth(1280);
});

describe("RecordActionDialog", () => {
  it("logs a cleaning with its method and note against the release", async () => {
    const { user, onOpenChange } = renderDialog();

    await user.selectOptions(screen.getByLabelText("Method"), "vacuum");
    await user.type(screen.getByLabelText("Note"), "two passes");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(lastBody()).toMatchObject({
      friend_id: 7,
      release_id: "rel",
      action_type: "cleaned",
      notes: "two passes",
      details: { method: "vacuum" },
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Cleaned logged", type: "success" })
    );
  });

  it("logs a sleeve change, rice paper first", async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Sleeve change" }));
    expect(screen.queryByLabelText("Method")).toBeNull();
    expect((screen.getByLabelText("New inner sleeve") as HTMLSelectElement).value).toBe(
      "poly-rice-paper-poly"
    );
    await user.selectOptions(screen.getByLabelText("New inner sleeve"), "poly");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createRecordAction).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ action_type: "sleeved", sleeve_type: "poly" });
  });

  it("offers a copy picker once there is more than one copy", async () => {
    api.listRecordCopies.mockResolvedValue({ items: [defaultCopy, djCopy], overdue_days: 365 });
    const { user } = renderDialog({ actionType: "inspected" });

    await user.selectOptions(await screen.findByLabelText("Copy"), "DJ copy");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createRecordAction).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ copy_id: 4, action_type: "inspected" });
    expect(lastBody().release_id).toBeUndefined();
  });

  it("starts on the copy it was opened for", async () => {
    api.listRecordCopies.mockResolvedValue({ items: [defaultCopy, djCopy], overdue_days: 365 });
    const { user } = renderDialog({ copy: djCopy, actionType: "repaired" });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createRecordAction).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ copy_id: 4, action_type: "repaired" });
  });

  it("refuses to save without a time", async () => {
    const { user } = renderDialog();

    await user.clear(screen.getByLabelText("When"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(api.createRecordAction).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Choose when it happened.", type: "error" })
    );
  });

  it("reports a failed save and stays open", async () => {
    api.createRecordAction.mockRejectedValue(new Error("Album not found"));
    const { user, onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to log care", description: "Album not found" })
      )
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("names a failure that is not an Error", async () => {
    api.createRecordAction.mockRejectedValue("boom");
    const { user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Unknown error" }))
    );
  });

  it("resets each time it opens", async () => {
    const { user, rerender } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Repaired" }));
    expect(screen.getByRole("button", { name: "Repaired" }).getAttribute("aria-pressed")).toBe("true");

    const props = { onOpenChange: vi.fn(), releaseId: "rel", friendId: 7 };
    rerender(<RecordActionDialog open={false} {...props} />);
    rerender(<RecordActionDialog open {...props} />);

    expect(
      (await screen.findByRole("button", { name: "Cleaned" })).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("is a bottom sheet on mobile, and cancels", async () => {
    setViewportWidth(375);
    const { user, onOpenChange } = renderDialog();

    expect(await screen.findByText("Log Record Care")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ["desktop", 1280],
    ["mobile", 375],
  ])("closes on Escape on %s", async (_layout, width) => {
    setViewportWidth(width);
    const { user, onOpenChange } = renderDialog();

    await screen.findByText("Log Record Care");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("cancels on desktop", async () => {
    const { user, onOpenChange } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
