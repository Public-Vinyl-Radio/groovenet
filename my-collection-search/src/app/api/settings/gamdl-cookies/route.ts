import { NextRequest, NextResponse } from "next/server";
import { gamdlCookieService } from "@/server/services/gamdlCookieService";

export const runtime = "nodejs";

/**
 * PUT /api/settings/gamdl-cookies
 * Upload or replace cookie file
 */
export async function PUT(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("cookieFile");
    const cookieInfo = await gamdlCookieService.uploadCookieFile(file);

    return NextResponse.json({
      success: true,
      message: "Cookie file uploaded successfully",
      cookieInfo,
    });
  } catch (error) {
    console.error("Failed to upload cookie file:", error);
    return NextResponse.json(
      {
        error: "Failed to upload cookie file",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
