import { NextResponse } from "next/server";
import { restoreDatabaseFromStream } from "@/server/services/restoreService";

/**
 * Restore from an uploaded backup. The preferred form is the raw file as the
 * request body with `?filename=`, which streams to disk without buffering
 * (#459). multipart/form-data with a `file` field is still accepted, but the
 * runtime buffers that whole upload in memory, so keep it for small files.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.startsWith("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      return NextResponse.json(await restoreDatabaseFromStream(file.stream(), file.name));
    }

    const fileName = new URL(request.url).searchParams.get("filename");
    if (!fileName || !request.body) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    return NextResponse.json(await restoreDatabaseFromStream(request.body, fileName));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
