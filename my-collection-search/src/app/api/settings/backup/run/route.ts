import { NextResponse } from "next/server";
import { runBackupNow } from "@/server/services/backupRunnerService";
import { backupStatusService } from "@/server/services/backupStatusService";

export const runtime = "nodejs";

export async function POST() {
  try {
    await runBackupNow("manual");
    const status = backupStatusService.getStatus();
    return NextResponse.json({ status });
  } catch (error) {
    console.error("Failed to run backup manually:", error);
    return NextResponse.json({ error: "Failed to run backup manually" }, { status: 500 });
  }
}
