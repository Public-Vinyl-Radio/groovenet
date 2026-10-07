import { NextResponse } from "next/server";
import { createBackup } from "@/server/services/databaseBackupService";

/**
 * Create a database backup in pg_dump custom format. The plain-format SQL
 * backup was retired in #459: custom format is compressed and restores with
 * pg_restore.
 */
export async function POST() {
  try {
    const { filename } = await createBackup();
    return NextResponse.json({
      message: `Backup created: ${filename}`,
      filename,
      format: "custom" as const,
    });
  } catch (error) {
    console.error("[backup] POST error:", error);
    return NextResponse.json(
      {
        error: `Failed to create backup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 }
    );
  }
}
