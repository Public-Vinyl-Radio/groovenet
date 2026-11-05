import { NextResponse } from "next/server";
import { backupStatusService } from "@/server/services/backupStatusService";
import { getBackupMetrics } from "@/server/services/backupMetricsService";
import { backupStatusGetResponseSchema } from "@/api-contract/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [status, metrics] = await Promise.all([
      Promise.resolve(backupStatusService.getStatus()),
      getBackupMetrics(),
    ]);
    return NextResponse.json(backupStatusGetResponseSchema.parse({ status, metrics }));
  } catch (error) {
    console.error("Failed to get backup status:", error);
    return NextResponse.json({ error: "Failed to get backup status" }, { status: 500 });
  }
}
