// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({
  createRecordCopy: vi.fn(),
  updateRecordCopy: vi.fn(),
  updateDefaultRecordCopy: vi.fn(),
}));
vi.mock("@/services/internalApi/recordCare", () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import RecordCopyFormDialog from "./RecordCopyFormDialog";

const copy = {
  id: 4,
  friend_id: 7,
  release_id: "rel",
  is_default: false,
  label: "DJ copy",
  notes: "VG+",
  inner_sleeve_type: null,
  last_cleaned_at: null,
  deleted_at: null,
  created_at: null,
  updated_at: null,
};

function renderDialog(props: Partial<React.ComponentProps<typeof RecordCopyFormDialog>> = {}) {
  const onOpenChange = vi.fn();
  const rendered = renderWithProviders(
    <RecordCopyFormDialog open onOpenChange={onOpenChange} releaseId="rel" friendId={7} {...props} />
  );
  return { ...rendered, onOpenChange };
}

afterEach(() => vi.resetAllMocks());

describe("RecordCopyFormDialog", () => {
  it("adds a copy with only the fields filled in", async () => {
    api.createRecordCopy.mockResolvedValue({});
    const { user, onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText("Label"), "  Sealed ");
    await user.click(screen.getByRole("button", { name: "Add Copy" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.createRecordCopy).toHaveBeenCalledWith({
      friend_id: 7,
      release_id: "rel",
      label: "Sealed",
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy added" }));
  });

  it("sends only what an edit changed, clearing an emptied field", async () => {
    api.updateRecordCopy.mockResolvedValue({});
    const { user, onOpenChange } = renderDialog({ copy });

    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("DJ copy");
    await user.clear(screen.getByLabelText("Notes"));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.updateRecordCopy).toHaveBeenCalledWith(4, { friend_id: 7, notes: null });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy updated" }));
  });

  it("labels an implicit default copy by release", async () => {
    api.updateDefaultRecordCopy.mockResolvedValue({});
    const implicit = { ...copy, id: null, is_default: true, label: null, notes: null };
    const { user } = renderDialog({ copy: implicit });

    await user.type(screen.getByLabelText("Label"), "Home copy");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(api.updateDefaultRecordCopy).toHaveBeenCalledWith({
        friend_id: 7,
        release_id: "rel",
        label: "Home copy",
      })
    );
  });

  it("closes without a request when nothing changed", async () => {
    const { user, onOpenChange } = renderDialog({ copy });

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.updateRecordCopy).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, new Error("Album not found"), "Failed to add copy", "Album not found"],
    [copy, "boom", "Failed to update copy", "Unknown error"],
  ])("reports a failure", async (target, thrown, title, description) => {
    api.createRecordCopy.mockRejectedValue(thrown);
    api.updateRecordCopy.mockRejectedValue(thrown);
    const { user } = renderDialog({ copy: target });

    await user.type(screen.getByLabelText("Label"), "x");
    await user.click(screen.getByRole("button", { name: target ? "Save Changes" : "Add Copy" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title, description }))
    );
  });

  it("refills from the copy each time it opens", async () => {
    const { user, rerender } = renderDialog({ copy });
    await user.type(screen.getByLabelText("Label"), " (edited)");

    const props = { onOpenChange: vi.fn(), releaseId: "rel", friendId: 7, copy };
    rerender(<RecordCopyFormDialog open={false} {...props} />);
    rerender(<RecordCopyFormDialog open {...props} />);

    expect(((await screen.findByLabelText("Label")) as HTMLInputElement).value).toBe("DJ copy");
  });
});
