import { NextResponse } from "next/server";
import { listBackups } from "@/server/services/databaseBackupService";

export async function GET() {
  try {
    const backups = await listBackups();
    return NextResponse.json({
      files: backups.map((backup) => backup.filename),
      backups,
    });
  } catch (error) {
    console.error("[backups] GET error:", error);
    return NextResponse.json({ error: "Failed to list backups" }, { status: 500 });
  }
}
