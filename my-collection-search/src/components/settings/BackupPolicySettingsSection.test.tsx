// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  fetchBackupPolicy: vi.fn(),
  updateBackupPolicy: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/services/internalApi/settings", () => ({
  fetchBackupPolicy: mocks.fetchBackupPolicy,
  updateBackupPolicy: mocks.updateBackupPolicy,
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import BackupPolicySettingsSection from "./BackupPolicySettingsSection";

const policy = {
  enabled: true,
  provider: "b2" as const,
  schedule_cron: "0 3 * * *",
  retention_preset: "balanced" as const,
  include_database: true,
  include_audio_files: false,
  include_album_covers: false,
  include_discogs_exports: false,
  include_essentia_files: false,
  include_uploads: false,
  updated_at: "2026-10-07T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchBackupPolicy.mockResolvedValue({ policy });
});

describe("BackupPolicySettingsSection", () => {
  it("loads the current policy", async () => {
    renderWithProviders(<BackupPolicySettingsSection />);
    expect(await screen.findByDisplayValue("0 3 * * *")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Enable remote backups" })).toBeTruthy();
  });

  it("says so when the policy can't be loaded", async () => {
    mocks.fetchBackupPolicy.mockRejectedValue(new Error("boom"));
    renderWithProviders(<BackupPolicySettingsSection />);
    expect(await screen.findByText("Policy unavailable.")).toBeTruthy();
  });

  it("toggles a checkbox and saves the updated policy", async () => {
    mocks.updateBackupPolicy.mockResolvedValue({ policy: { ...policy, include_audio_files: true } });
    const { user } = renderWithProviders(<BackupPolicySettingsSection />);
    await screen.findByDisplayValue("0 3 * * *");

    await user.click(screen.getByRole("checkbox", { name: "Include audio files" }));
    await user.click(screen.getByRole("button", { name: "Save Policy" }));

    await waitFor(() =>
      expect(mocks.updateBackupPolicy).toHaveBeenCalledWith(
        expect.objectContaining({ include_audio_files: true })
      )
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Backup policy saved", type: "success" })
      )
    );
  });
});
