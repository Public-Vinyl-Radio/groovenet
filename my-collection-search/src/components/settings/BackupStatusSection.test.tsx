// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchBackupStatus: vi.fn(),
  runBackupNow: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/services/internalApi/settings", () => ({
  fetchBackupStatus: mocks.fetchBackupStatus,
  runBackupNow: mocks.runBackupNow,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import BackupStatusSection from "./BackupStatusSection";

const status = {
  started_at: "2026-10-07T12:00:00.000Z",
  finished_at: "2026-10-07T12:05:00.000Z",
  stored_at: "2026-10-07T12:05:01.000Z",
  status: "success" as const,
  reason: "scheduled",
  backed_up_paths: ["/data/db.dump"],
  snapshot: { id: "abc123def", short_id: "abc123d", time: "2026-10-07T12:05:00.000Z", hostname: "beelink", tags: ["nightly"] },
};
const metrics = {
  captured_at: "2026-10-07T12:05:01.000Z",
  local_source_bytes: 1024,
  snapshot_count: 5,
  remote_repository_bytes: 2048,
  recent_snapshots: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchBackupStatus.mockResolvedValue({ status, metrics });
});

describe("BackupStatusSection", () => {
  it("shows the last backup's status, reason and snapshot", async () => {
    renderWithProviders(<BackupStatusSection />);
    expect(await screen.findByText("success")).toBeTruthy();
    expect(screen.getByText("Reason: scheduled")).toBeTruthy();
    expect(screen.getByText("ID: abc123d")).toBeTruthy();
    expect(screen.getByText("Host: beelink")).toBeTruthy();
  });

  it("says so when nothing has run yet", async () => {
    mocks.fetchBackupStatus.mockResolvedValue({ status: null });
    renderWithProviders(<BackupStatusSection />);
    expect(await screen.findByText("No remote backup status has been recorded yet.")).toBeTruthy();
  });

  it("runs a backup now and reports the toast", async () => {
    mocks.runBackupNow.mockResolvedValue({ status: { ...status, reason: "manual" } });
    const { user } = renderWithProviders(<BackupStatusSection />);
    await screen.findByText("success");

    await user.click(screen.getByRole("button", { name: "Run Remote Backup" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Remote backup completed", type: "success" })
      )
    );
    expect(mocks.fetchBackupStatus).toHaveBeenCalledTimes(2);
  });
});
