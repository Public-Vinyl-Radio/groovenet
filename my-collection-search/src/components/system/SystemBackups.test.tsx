// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
const api = vi.hoisted(() => ({
  fetchBackupPolicy: vi.fn(),
  updateBackupPolicy: vi.fn(),
  fetchBackupStatus: vi.fn(),
  runBackupNow: vi.fn(),
}));
vi.mock("@/services/internalApi/settings", () => api);
vi.mock("@/components/settings/DatabaseBackups", () => ({ default: () => "Local backup list" }));
import SystemBackups from "./SystemBackups";
const policy = {
  enabled: true,
  provider: "restic-b2",
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced",
  include_database: true,
  include_audio_files: true,
  include_album_covers: true,
  include_discogs_exports: true,
  include_essentia_files: true,
  include_uploads: true,
  updated_at: "2026-10-01T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchBackupPolicy.mockResolvedValue({ policy });
  api.fetchBackupStatus.mockResolvedValue({ status: null });
  api.updateBackupPolicy.mockImplementation(async (body) => ({ policy: { ...policy, ...body } }));
});
it("loads all rows and immediately saves a switch change with undo", async () => {
  const { user } = renderWithProviders(<SystemBackups />);
  await screen.findByRole("combobox", { name: "Schedule" });
  for (const label of ["Remote backups", "Schedule", "Keep", "Include", "Local database backups"])
    expect(screen.getByRole("heading", { name: label })).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: "Remote backups" }));
  await screen.findByText("SAVED ·");
  expect(api.updateBackupPolicy).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
  await user.click(screen.getByRole("button", { name: "UNDO" }));
  await screen.findByText("SAVED");
  expect(api.updateBackupPolicy).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );
  expect(screen.queryByRole("button", { name: "UNDO" })).toBeNull();
});
it.each([
  "Database dumps",
  "Audio files",
  "Album covers",
  "Discogs JSON exports",
  "Essentia analysis files",
  "Uploads directory",
])("saves %s instantly", async (name) => {
  const { user } = renderWithProviders(<SystemBackups />);
  await user.click(await screen.findByRole("checkbox", { name }));
  await screen.findByText("SAVED ·");
  expect(api.updateBackupPolicy).toHaveBeenCalledTimes(1);
});
it.each(["AGGRESSIVE", "ARCHIVE"])("saves retention %s", async (name) => {
  const { user } = renderWithProviders(<SystemBackups />);
  await user.click(await screen.findByRole("button", { name }));
  await screen.findByText("SAVED ·");
  expect(api.updateBackupPolicy).toHaveBeenCalledWith(
    expect.objectContaining({ retention_preset: name.toLowerCase() }),
  );
});
it("maps presets to cron, and only saves custom cron on blur", async () => {
  const { user } = renderWithProviders(<SystemBackups />);
  const select = await screen.findByRole("combobox", { name: "Schedule" });
  await user.selectOptions(select, "0 0 * * *");
  await screen.findByText("SAVED ·");
  expect(api.updateBackupPolicy).toHaveBeenLastCalledWith(
    expect.objectContaining({ schedule_cron: "0 0 * * *" }),
  );
  await user.selectOptions(select, "custom");
  const input = screen.getByRole("textbox", { name: "Custom cron expression" });
  fireEvent.change(input, { target: { value: "0 3 * * *" } });
  expect(api.updateBackupPolicy).toHaveBeenCalledTimes(1);
  fireEvent.blur(input);
  await waitFor(() => expect(api.updateBackupPolicy).toHaveBeenCalledTimes(2));
  expect(api.updateBackupPolicy).toHaveBeenLastCalledWith(
    expect.objectContaining({ schedule_cron: "0 3 * * *" }),
  );
});
it("maps an existing custom cron and does not resave it on blur", async () => {
  api.fetchBackupPolicy.mockResolvedValue({ policy: { ...policy, schedule_cron: "0 3 * * *" } });
  renderWithProviders(<SystemBackups />);
  const input = await screen.findByRole("textbox", { name: "Custom cron expression" });
  fireEvent.blur(input);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("custom");
  expect(api.updateBackupPolicy).not.toHaveBeenCalled();
});
it("shows save errors inline, retaining the persisted policy", async () => {
  api.updateBackupPolicy.mockRejectedValue(new Error("Read only"));
  const { user } = renderWithProviders(<SystemBackups />);
  await user.click(await screen.findByRole("checkbox", { name: "Remote backups" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Read only");
  await waitFor(() =>
    expect(
      (screen.getByRole("checkbox", { name: "Remote backups" }) as HTMLInputElement).checked,
    ).toBe(true),
  );
});
it("shows load errors inline and still exposes local backups", async () => {
  api.fetchBackupPolicy.mockRejectedValue("Policy unavailable");
  renderWithProviders(<SystemBackups />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Policy unavailable");
  expect(screen.getByText("Local backup list")).toBeTruthy();
});
it("shows status load errors", async () => {
  api.fetchBackupStatus.mockRejectedValue(new Error("Status unavailable"));
  renderWithProviders(<SystemBackups />);
  expect(await screen.findByText("Status unavailable")).toBeTruthy();
});
it.each(["success", "failed", "skipped"])(
  "runs a mocked remote backup and reports %s",
  async (status) => {
    api.runBackupNow.mockResolvedValue({
      status: {
        finished_at: "2026-10-01T00:00:00Z",
        status,
        error: status === "failed" ? "B2 unavailable" : undefined,
      },
    });
    const { user } = renderWithProviders(<SystemBackups />);
    await user.click(await screen.findByRole("button", { name: "RUN BACKUP NOW" }));
    expect(
      await screen.findByText(
        new RegExp(`LAST RUN.*${status === "success" ? "OK" : status.toUpperCase()}`),
      ),
    ).toBeTruthy();
    if (status === "failed") expect(screen.getByRole("alert").textContent).toBe("B2 unavailable");
  },
);
it("reports remote backup failure inline", async () => {
  api.runBackupNow.mockRejectedValue("Network unavailable");
  const { user } = renderWithProviders(<SystemBackups />);
  await user.click(await screen.findByRole("button", { name: "RUN BACKUP NOW" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Network unavailable");
});

it.each(["policy", "status", "policy-error", "status-error"])(
  "ignores a late %s response after unmount",
  async (source) => {
    let resolve!: (value: unknown) => void;
    let reject!: (value: unknown) => void;
    const pending = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    if (source.startsWith("policy")) api.fetchBackupPolicy.mockReturnValue(pending);
    else api.fetchBackupStatus.mockReturnValue(pending);
    const { unmount } = renderWithProviders(<SystemBackups />);
    unmount();
    await act(async () => {
      if (source.endsWith("error")) reject(new Error("Offline"));
      else resolve(source === "policy" ? { policy } : { status: null });
    });
  },
);
it("explains an unsupported custom schedule", async () => {
  api.fetchBackupPolicy.mockResolvedValue({ policy: { ...policy, schedule_cron: "0 0 * * MON" } });
  renderWithProviders(<SystemBackups />);
  expect(await screen.findByText(/No predicted run/)).toBeTruthy();
});
