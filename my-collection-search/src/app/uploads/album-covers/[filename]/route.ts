import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;
    const safeName = path.basename(filename || "");
    if (!safeName) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), "public", "uploads", "album-covers");
    const filePath = path.join(baseDir, safeName);
    const resolvedBase = path.resolve(baseDir);
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const bytes = await fs.readFile(resolvedPath);
    const body = new Blob([Uint8Array.from(bytes)], {
      type: contentTypeFor(safeName),
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
