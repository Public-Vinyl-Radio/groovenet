import { describe, expect, it } from "vitest";
import { evaluateBackupHealth } from "../backupHealthService";
import type { BackupStatus } from "@/types/backup";

const now = Date.parse("2026-09-19T12:00:00.000Z");

function backup(overrides: Partial<BackupStatus> = {}): BackupStatus {
  return {
    started_at: "2026-09-19T05:50:00.000Z",
    finished_at: "2026-09-19T06:00:00.000Z",
    stored_at: "2026-09-19T06:00:00.000Z",
    status: "success",
    reason: "scheduled",
    backed_up_paths: ["/app/dumps"],
    snapshot: null,
    ...overrides,
  };
}

describe("evaluateBackupHealth", () => {
  it("fails closed when no completed backup has been recorded", () => {
    expect(evaluateBackupHealth(null, now, 12)).toMatchObject({
      healthy: false,
      reason: "no-backup-status",
    });
  });

  it("reports a recorded Restic failure immediately", () => {
    expect(evaluateBackupHealth(backup({ status: "failed" }), now, 12)).toMatchObject({
      healthy: false,
      reason: "backup-failed",
    });
  });

  it("reports an overdue successful backup", () => {
    expect(evaluateBackupHealth(backup(), now, 5)).toMatchObject({
      healthy: false,
      reason: "backup-overdue",
    });
  });

  it("accepts a recent successful backup", () => {
    expect(evaluateBackupHealth(backup(), now, 12)).toMatchObject({
      healthy: true,
      status: "ok",
      age_hours: 6,
    });
  });

  it("does not alert when remote backups are deliberately disabled", () => {
    expect(evaluateBackupHealth(backup({ status: "skipped", reason: "policy-disabled" }), now, 12)).toMatchObject({
      healthy: true,
      status: "disabled",
    });
  });
});
