import { NextResponse } from "next/server";
import { runAllBackups } from "@/server/services/backupRunnerService";
import { backupStatusService } from "@/server/services/backupStatusService";
import { localBackupConfigured } from "@/server/services/backupTargets";
import { backupStatusRunResponseSchema } from "@/api-contract/schemas";

export const runtime = "nodejs";

export async function POST() {
  try {
    await runAllBackups("manual");
    const status = backupStatusService.getStatus("remote");
    const local = localBackupConfigured()
      ? { status: backupStatusService.getStatus("local") }
      : undefined;
    return NextResponse.json(backupStatusRunResponseSchema.parse({ status, local }));
  } catch (error) {
    console.error("Failed to run backup manually:", error);
    return NextResponse.json({ error: "Failed to run backup manually" }, { status: 500 });
  }
}
