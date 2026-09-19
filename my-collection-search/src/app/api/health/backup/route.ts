import { NextResponse } from "next/server";
import { backupStatusService } from "@/server/services/backupStatusService";
import { evaluateBackupHealth } from "@/server/services/backupHealthService";

export const runtime = "nodejs";

const maxAgeHours = Number(process.env.BACKUP_HEALTH_MAX_AGE_HOURS ?? "12");

export async function GET() {
  try {
    const backup = backupStatusService.getStatus();
    const health = evaluateBackupHealth(backup, Date.now(), maxAgeHours);
    return NextResponse.json(
      { ...health, finished_at: backup?.finished_at, max_age_hours: maxAgeHours },
      { status: health.healthy ? 200 : 503 }
    );
  } catch (error) {
    console.error("Failed to evaluate backup health:", error);
    return NextResponse.json({ status: "unhealthy", reason: "status-unavailable" }, { status: 503 });
  }
}
