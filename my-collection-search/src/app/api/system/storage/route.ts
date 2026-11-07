import { NextResponse } from "next/server";

import { storageService } from "@/server/services/storageService";

export const dynamic = "force-dynamic";

// Storage section of /system (#1051). Sizes are the stored audio_size_bytes;
// only the free-space figure touches the filesystem (one statfs call).
export async function GET() {
  try {
    return NextResponse.json(await storageService.getStorage());
  } catch (error) {
    console.error("[GET /api/system/storage]", error);
    return NextResponse.json({ error: "Failed to read storage" }, { status: 500 });
  }
}
