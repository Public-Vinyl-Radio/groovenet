// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const api = vi.hoisted(() => ({ deleteAlbum: vi.fn() }));
vi.mock("@/services/internalApi/albums", () => api);

import DeleteAlbumDialog from "./DeleteAlbumDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteAlbumDialog>> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const notify = vi.fn();
  const rendered = renderWithProviders(
    <DeleteAlbumDialog
      open
      releaseId="r1"
      friendId={7}
      albumTitle="Blue Lines"
      onClose={onClose}
      onDeleted={onDeleted}
      notify={notify}
      {...props}
    />,
  );
  return { ...rendered, onClose, onDeleted, notify };
}

beforeEach(() => {
  api.deleteAlbum.mockResolvedValue({ success: true });
});
afterEach(() => vi.resetAllMocks());

describe("DeleteAlbumDialog (#511)", () => {
  it("mentions the Discogs resurrection caveat", () => {
    renderDialog();
    expect(screen.getByText(/next full sync will add it back/i)).toBeTruthy();
  });

  it("deletes the album and reports success on confirm", async () => {
    const { user, onClose, onDeleted, notify } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.deleteAlbum).toHaveBeenCalledWith("r1", 7));
    expect(notify).toHaveBeenCalledWith({ title: "Album deleted.", type: "success" });
    expect(onDeleted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("reports failure and still closes when the delete call rejects", async () => {
    api.deleteAlbum.mockRejectedValue(new Error("boom"));
    const { user, onClose, onDeleted, notify } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({ title: "Failed to delete album.", type: "error" }),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without deleting via the close button", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
    expect(api.deleteAlbum).not.toHaveBeenCalled();
  });

  it("closes without deleting on Escape", async () => {
    const { user, onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(api.deleteAlbum).not.toHaveBeenCalled();
  });

  it("falls back to a generic title when none is given", () => {
    renderDialog({ albumTitle: undefined });
    expect(screen.getByText("Delete Album")).toBeTruthy();
  });
});
