// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const restore = vi.hoisted(() => vi.fn());
vi.mock("@/services/backupService", () => ({ restoreDatabase: restore }));
import DatabaseRestore from "./DatabaseRestore";
beforeEach(() => vi.resetAllMocks());
it("requires a file and exact typed confirmation before restoring", async () => {
  restore.mockResolvedValue({ message: "Database restored" });
  const { user } = renderWithProviders(<DatabaseRestore />);
  expect((screen.getByRole("button", { name: "RESTORE…" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  const file = new File(["sql"], "database.sql", { type: "application/sql" });
  const input = screen.getByLabelText("Choose restore file");
  const click = vi.spyOn(input, "click");
  await user.click(screen.getByRole("button", { name: "CHOOSE FILE" }));
  expect(click).toHaveBeenCalled();
  await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "RESTORE…" }));
  const dialog = await screen.findByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", {
    name: "Restore database",
  }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  await user.type(screen.getByLabelText("Type RESTORE to confirm"), "restore");
  expect(confirm.disabled).toBe(true);
  await user.clear(screen.getByLabelText("Type RESTORE to confirm"));
  await user.type(screen.getByLabelText("Type RESTORE to confirm"), "RESTORE");
  expect(restore).not.toHaveBeenCalled();
  await user.click(confirm);
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Database restored");
  expect(restore).toHaveBeenCalledWith(file);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect((screen.getByRole("button", { name: "RESTORE…" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it.each([new Error("Invalid dump"), "Invalid dump"])(
  "shows restore errors and permits cancel/retry (%s)",
  async (error) => {
    restore.mockRejectedValue(error);
    const { user } = renderWithProviders(<DatabaseRestore />);
    await user.upload(screen.getByLabelText("Choose restore file"), new File([""], "test.dump"));
    await user.click(screen.getByRole("button", { name: "RESTORE…" }));
    await user.type(await screen.findByLabelText("Type RESTORE to confirm"), "RESTORE");
    await user.click(screen.getByRole("button", { name: "Restore database" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Invalid dump");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "RESTORE…" }));
    expect(
      ((await screen.findByLabelText("Type RESTORE to confirm")) as HTMLInputElement).value,
    ).toBe("");
  },
);
it("clears a cancelled file selection", () => {
  renderWithProviders(<DatabaseRestore />);
  fireEvent.change(screen.getByLabelText("Choose restore file"), { target: { files: [] } });
  expect((screen.getByRole("button", { name: "RESTORE…" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("uses the fallback completion text", async () => {
  restore.mockResolvedValue({});
  const { user } = renderWithProviders(<DatabaseRestore />);
  await user.upload(screen.getByLabelText("Choose restore file"), new File([""], "test.backup"));
  await user.click(screen.getByRole("button", { name: "RESTORE…" }));
  await user.type(await screen.findByLabelText("Type RESTORE to confirm"), "RESTORE");
  await user.click(screen.getByRole("button", { name: "Restore database" }));
  expect(await screen.findByText("Restore complete")).toBeTruthy();
});
it("does not restore if the file selection is cleared while the dialog is open", async () => {
  const { user } = renderWithProviders(<DatabaseRestore />);
  const input = screen.getByLabelText("Choose restore file");
  await user.upload(input, new File([""], "test.dump"));
  await user.click(screen.getByRole("button", { name: "RESTORE…" }));
  await user.type(await screen.findByLabelText("Type RESTORE to confirm"), "RESTORE");
  fireEvent.change(input, { target: { files: [] } });
  await user.click(screen.getByRole("button", { name: "Restore database" }));
  expect(restore).not.toHaveBeenCalled();
});
