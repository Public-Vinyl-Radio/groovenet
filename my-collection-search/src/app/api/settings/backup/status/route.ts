import { NextResponse } from "next/server";
import { backupStatusService } from "@/server/services/backupStatusService";
import { getBackupMetrics } from "@/server/services/backupMetricsService";
import { backupPolicyService } from "@/server/services/backupPolicyService";
import { evaluateBackupHealth } from "@/server/services/backupHealthService";
import { localBackupConfigured } from "@/server/services/backupTargets";
import { backupStatusGetResponseSchema } from "@/api-contract/schemas";

export const runtime = "nodejs";

const maxAgeHours = Number(process.env.BACKUP_HEALTH_MAX_AGE_HOURS ?? "12");

function healthOf(enabled: boolean, status: ReturnType<typeof backupStatusService.getStatus>) {
  const {
    healthy,
    status: verdict,
    reason,
    age_hours,
  } = enabled
    ? evaluateBackupHealth(status, Date.now(), maxAgeHours)
    : { healthy: true, status: "disabled" as const, reason: undefined, age_hours: undefined };
  return { healthy, status: verdict, reason, age_hours };
}

export async function GET() {
  try {
    const [status, metrics, policy] = await Promise.all([
      Promise.resolve(backupStatusService.getStatus("remote")),
      getBackupMetrics("remote"),
      backupPolicyService.getPolicy(),
    ]);
    // `local` appears only when the host mounted a backup disk; absent means no UI for it.
    const localStatus = backupStatusService.getStatus("local");
    const local = localBackupConfigured()
      ? {
          status: localStatus,
          metrics: await getBackupMetrics("local"),
          health: healthOf(policy.local.enabled, localStatus),
        }
      : undefined;
    return NextResponse.json(
      backupStatusGetResponseSchema.parse({
        status,
        metrics,
        health: healthOf(policy.remote.enabled, status),
        max_age_hours: maxAgeHours,
        local,
      }),
    );
  } catch (error) {
    console.error("Failed to get backup status:", error);
    return NextResponse.json({ error: "Failed to get backup status" }, { status: 500 });
  }
}
