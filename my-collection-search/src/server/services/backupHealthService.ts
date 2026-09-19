import type { BackupStatus } from "@/types/backup";

export type BackupHealth = {
  healthy: boolean;
  status: "ok" | "disabled" | "unhealthy";
  reason?: "no-backup-status" | "backup-failed" | "backup-overdue";
  age_hours?: number;
};

export function evaluateBackupHealth(
  backup: BackupStatus | null,
  now: number,
  maxAgeHours: number
): BackupHealth {
  if (!backup) return { healthy: false, status: "unhealthy", reason: "no-backup-status" };
  if (backup.status === "failed") {
    return { healthy: false, status: "unhealthy", reason: "backup-failed" };
  }
  if (backup.reason === "policy-disabled") return { healthy: true, status: "disabled" };

  const ageHours = (now - new Date(backup.finished_at).getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours > maxAgeHours) {
    return { healthy: false, status: "unhealthy", reason: "backup-overdue" };
  }
  return { healthy: true, status: "ok", age_hours: ageHours };
}
