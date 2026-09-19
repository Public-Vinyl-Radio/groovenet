import { NextResponse } from "next/server";
import { backupStatusService } from "@/server/services/backupStatusService";
import { getBackupMetrics } from "@/server/services/backupMetricsService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [status, metrics] = await Promise.all([
      Promise.resolve(backupStatusService.getStatus()),
      getBackupMetrics(),
    ]);
    return NextResponse.json({ status, metrics });
  } catch (error) {
    console.error("Failed to get backup status:", error);
    return NextResponse.json(
      { error: "Failed to get backup status" },
      { status: 500 }
    );
  }
}
