// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchBackups: vi.fn(),
  deleteBackup: vi.fn(),
  backupDatabase: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/services/internalApi/backup", () => ({
  fetchBackups: mocks.fetchBackups,
  deleteBackup: mocks.deleteBackup,
  backupDatabase: mocks.backupDatabase,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import DatabaseBackups from "./DatabaseBackups";

function backup(filename: string, size_bytes = 1024) {
  return { filename, size_bytes, modified_at: "2026-10-07T12:00:00.000Z" };
}

function serve(backups: ReturnType<typeof backup>[]) {
  mocks.fetchBackups.mockResolvedValue({ files: backups.map((b) => b.filename), backups });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DatabaseBackups", () => {
  it("lists backups with their size and a download link", async () => {
    serve([backup("pg-backup-a.dump", 3 * 1024 * 1024)]);
    renderWithProviders(<DatabaseBackups />);

    expect(await screen.findByText("pg-backup-a.dump")).toBeTruthy();
    expect(screen.getByText(/3\.0 MiB/)).toBeTruthy();
    expect(
      screen.getByRole("link").getAttribute("href")
    ).toBe("/api/backups/pg-backup-a.dump");
  });

  it("says so when there are no backups", async () => {
    serve([]);
    renderWithProviders(<DatabaseBackups />);
    expect(await screen.findByText("No backups found in the directory.")).toBeTruthy();
  });

  it("deletes a backup after confirmation", async () => {
    serve([backup("old.sql")]);
    mocks.deleteBackup.mockResolvedValue({ deleted: "old.sql" });
    const { user } = renderWithProviders(<DatabaseBackups />);

    await user.click(await screen.findByRole("button", { name: "Delete old.sql" }));
    expect(mocks.deleteBackup).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.deleteBackup).toHaveBeenCalledWith("old.sql"));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Backup deleted", type: "success" })
      )
    );
    // The list is refetched once the delete settles.
    await waitFor(() => expect(mocks.fetchBackups).toHaveBeenCalledTimes(2));
  });

  it("toasts a failed delete", async () => {
    serve([backup("old.sql")]);
    mocks.deleteBackup.mockRejectedValue(new Error("Backup not found"));
    const { user } = renderWithProviders(<DatabaseBackups />);

    await user.click(await screen.findByRole("button", { name: "Delete old.sql" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Delete failed", description: "Backup not found" })
      )
    );
  });

  it("closes the confirmation without deleting", async () => {
    serve([backup("old.sql")]);
    const { user } = renderWithProviders(<DatabaseBackups />);

    await user.click(await screen.findByRole("button", { name: "Delete old.sql" }));
    const prompt = await screen.findByRole("alertdialog");
    await user.click(within(prompt).getByRole("button", { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.deleteBackup).not.toHaveBeenCalled();
  });

  it("shows the first five backups until expanded", async () => {
    serve(Array.from({ length: 7 }, (_, i) => backup(`b${i}.dump`)));
    const { user } = renderWithProviders(<DatabaseBackups />);

    await screen.findByText("b0.dump");
    expect(screen.queryByText("b6.dump")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show All (7)" }));
    expect(screen.getByText("b6.dump")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show Less" }));
    expect(screen.queryByText("b6.dump")).toBeNull();
  });
});
