import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  deleteBackup,
  resolveBackupPath,
} from "@/server/services/databaseBackupService";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { filename } = await context.params;
    const filePath = resolveBackupPath(filename);
    if (!filePath) {
      return NextResponse.json({ error: "Invalid backup filename" }, { status: 400 });
    }

    let size: number;
    try {
      size = (await fs.promises.stat(filePath)).size;
    } catch {
      return new Response("File not found", { status: 404 });
    }

    // Stream from disk: a backup can be larger than Node will buffer (#459).
    const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[backups/filename] GET error:", error);
    return NextResponse.json({ error: "Failed to retrieve backup file" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { filename } = await context.params;
    const result = await deleteBackup(filename);
    if (result === "invalid") {
      return NextResponse.json({ error: "Invalid backup filename" }, { status: 400 });
    }
    if (result === "not-found") {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: filename });
  } catch (error) {
    console.error("[backups/filename] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete backup" }, { status: 500 });
  }
}
