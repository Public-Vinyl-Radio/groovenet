import { NextResponse } from "next/server";
import { backupStatusService } from "@/server/services/backupStatusService";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import { evaluateBackupHealth } from "@/server/services/backupHealthService";
import { localBackupConfigured } from "@/server/services/backupTargets";
import { backupHealthResponseSchema } from "@/api-contract/schemas";

export const runtime = "nodejs";

const maxAgeHours = Number(process.env.BACKUP_HEALTH_MAX_AGE_HOURS ?? "12");

export async function GET() {
  try {
    const policy = backupPolicyService.getPolicy();
    const now = Date.now();

    // Each target is measured against the same max age. A target switched off, or no
    // local disk configured, never makes the check unhealthy.
    const backup = backupStatusService.getStatus("remote");
    const health = policy.remote.enabled
      ? evaluateBackupHealth(backup, now, maxAgeHours)
      : { healthy: true, status: "disabled" as const };

    let local;
    if (localBackupConfigured()) {
      const localBackup = backupStatusService.getStatus("local");
      const localHealth = policy.local.enabled
        ? evaluateBackupHealth(localBackup, now, maxAgeHours)
        : { healthy: true, status: "disabled" as const };
      local = {
        ...localHealth,
        finished_at: localBackup?.finished_at,
        ...(localBackup?.error ? { error: localBackup.error } : {}),
      };
    }

    const healthy = health.healthy && (local?.healthy ?? true);
    return NextResponse.json(
      backupHealthResponseSchema.parse({
        ...health,
        healthy,
        // The overall verdict: a failing local disk fails the check even if the remote is fine.
        status: healthy ? health.status : "unhealthy",
        finished_at: backup?.finished_at,
        max_age_hours: maxAgeHours,
        ...(local ? { local } : {}),
      }),
      { status: healthy ? 200 : 503 },
    );
  } catch (error) {
    console.error("Failed to evaluate backup health:", error);
    return NextResponse.json(
      { status: "unhealthy", reason: "status-unavailable" },
      { status: 503 },
    );
  }
}
