// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  remote: {
    enabled: true,
    include_database: true,
    include_album_covers: true,
    include_aac_audio: true,
    include_lossless_audio: false,
  },
  local: {
    enabled: true,
    include_database: false,
    include_album_covers: false,
    include_aac_audio: false,
    include_lossless_audio: true,
  },
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
  for (const label of ["Remote backups", "Schedule", "Keep", "Remote", "Local database backups"])
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
  "AAC audio",
  "Lossless audio (FLAC)",
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
it("shows no local disk row when the host has none", async () => {
  renderWithProviders(<SystemBackups />);
  await screen.findByRole("heading", { name: "Remote" });
  expect(screen.queryByRole("heading", { name: "Local disk" })).toBeNull();
  expect(screen.queryByTestId("backup-target-local")).toBeNull();
});
it("saves a remote lossless change under remote, leaving local alone", async () => {
  const { user } = renderWithProviders(<SystemBackups />);
  await user.click(await screen.findByRole("checkbox", { name: "Lossless audio (FLAC)" }));
  await screen.findByText("SAVED ·");
  const body = api.updateBackupPolicy.mock.calls[0][0];
  expect(body.remote.include_lossless_audio).toBe(true);
  expect(body.local).toEqual(policy.local);
});

const localStatus = (over = {}) => ({
  status: {
    started_at: "2026-10-01T00:00:00Z",
    finished_at: "2026-10-01T00:01:00Z",
    status: "success",
    ...over,
  },
  metrics: {
    captured_at: "2026-10-01T00:00:00Z",
    local_source_bytes: 0,
    snapshot_count: 3,
    remote_repository_bytes: 2048,
    recent_snapshots: [],
  },
  health: { healthy: true, status: "ok", age_hours: 2 },
});
describe("with a local disk configured", () => {
  beforeEach(() => {
    api.fetchBackupStatus.mockResolvedValue({
      status: null,
      health: { healthy: false, status: "unhealthy", reason: "no-backup-status" },
      max_age_hours: 12,
      local: localStatus(),
    });
  });

  it("shows both targets with their own health against the max age", async () => {
    renderWithProviders(<SystemBackups />);
    expect(await screen.findByRole("heading", { name: "Local disk" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Scheduled backups" })).toBeTruthy();
    expect(await screen.findByText("UNHEALTHY · NO RUN YET")).toBeTruthy();
    expect(screen.getByText("HEALTHY · 2h ago")).toBeTruthy();
    expect(screen.getByText(/ALERTS AFTER 12H/)).toBeTruthy();
    expect(screen.getByText("3 SNAPSHOTS · 2.0 KiB ON DISK")).toBeTruthy();
  });

  it("words age and snapshot counts for every case", async () => {
    api.fetchBackupStatus.mockResolvedValue({
      status: null,
      health: { healthy: true, status: "ok" },
      local: {
        ...localStatus(),
        status: null,
        metrics: { ...localStatus().metrics, snapshot_count: 1 },
        health: { healthy: true, status: "ok", age_hours: 0.2 },
      },
    });
    renderWithProviders(<SystemBackups />);
    expect(await screen.findByText("HEALTHY · under 1h ago")).toBeTruthy();
    expect(screen.getByText("HEALTHY ·")).toBeTruthy();
    expect(screen.getByText("1 SNAPSHOT · 2.0 KiB ON DISK")).toBeTruthy();
  });

  it("shows a repository with no snapshot count", async () => {
    api.fetchBackupStatus.mockResolvedValue({
      status: null,
      local: { ...localStatus(), metrics: { ...localStatus().metrics, snapshot_count: null } },
    });
    renderWithProviders(<SystemBackups />);
    expect(await screen.findByText("0 SNAPSHOTS · 2.0 KiB ON DISK")).toBeTruthy();
  });

  it("saves a local include change under local only", async () => {
    const { user } = renderWithProviders(<SystemBackups />);
    await screen.findByTestId("backup-target-local");
    const boxes = screen.getAllByRole("checkbox", { name: "AAC audio" });
    await user.click(boxes[1]);
    await screen.findByText("SAVED ·");
    const body = api.updateBackupPolicy.mock.calls[0][0];
    expect(body.local.include_aac_audio).toBe(true);
    expect(body.remote).toEqual(policy.remote);
  });

  it("shows why the disk run failed, e.g. a missing marker", async () => {
    api.fetchBackupStatus.mockResolvedValue({
      status: null,
      local: {
        ...localStatus({
          status: "failed",
          error: "Marker file .groovenet-backup-disk is missing",
        }),
        health: { healthy: false, status: "unhealthy", reason: "backup-failed" },
      },
    });
    renderWithProviders(<SystemBackups />);
    expect(await screen.findByText("UNHEALTHY · LAST RUN FAILED")).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("Marker file");
  });

  it("explains an unreachable repository and an overdue run", async () => {
    api.fetchBackupStatus.mockResolvedValue({
      status: null,
      local: {
        ...localStatus(),
        metrics: { ...localStatus().metrics, error: "wrong password" },
        health: { healthy: false, status: "unhealthy", reason: "backup-overdue" },
      },
    });
    renderWithProviders(<SystemBackups />);
    expect(await screen.findByText("UNHEALTHY · OVERDUE")).toBeTruthy();
    expect(screen.getByText("REPOSITORY UNAVAILABLE · wrong password")).toBeTruthy();
  });

  it("marks a switched-off target OFF and saves the switch under that target", async () => {
    api.fetchBackupPolicy.mockResolvedValue({
      policy: { ...policy, local: { ...policy.local, enabled: false } },
    });
    const { user } = renderWithProviders(<SystemBackups />);
    expect(await screen.findByText("OFF")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Local disk target" }));
    await screen.findByText("SAVED ·");
    expect(api.updateBackupPolicy.mock.calls[0][0].local.enabled).toBe(true);
  });

  it("reloads health after a manual run", async () => {
    api.runBackupNow.mockResolvedValue({ status: null, local: { status: null } });
    const { user } = renderWithProviders(<SystemBackups />);
    await user.click(await screen.findByRole("button", { name: "RUN BACKUP NOW" }));
    await waitFor(() => expect(api.fetchBackupStatus).toHaveBeenCalledTimes(2));
  });
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
