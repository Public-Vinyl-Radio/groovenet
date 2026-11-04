import { NextRequest, NextResponse } from "next/server";
import { gamdlActionSchema } from "@/api-contract/schemas";
import { settingsService } from "@/server/services/settingsService";
import { gamdlCookieService } from "@/server/services/gamdlCookieService";
import { gamdlConnectionTestService } from "@/server/services/gamdlConnectionTestService";
import type { GamdlConnectionTestDetails } from "@/types/gamdl";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawAction = String(body?.action || "");

    if (!rawAction) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const parsedAction = gamdlActionSchema.safeParse(rawAction);
    if (!parsedAction.success) {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
    const action = parsedAction.data;

    if (action === "cookie_status") {
      const cookieInfo = await gamdlCookieService.getCookieFileInfo();
      return NextResponse.json(cookieInfo);
    }

    if (action === "delete_cookie") {
      await gamdlCookieService.deleteCookieFile();
      return NextResponse.json({
        success: true,
        message: "Cookie file deleted successfully",
      });
    }

    if (action === "test_connection") {
      const result = await gamdlConnectionTestService.testConnection();
      return NextResponse.json(result);
    }

    // The only action left is reset_settings.
    const friendIdNum = Number(body?.friend_id);
    if (!friendIdNum || Number.isNaN(friendIdNum)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }
    const settings = await settingsService.resetGamdlSettings(friendIdNum);
    return NextResponse.json({
      success: true,
      message: "Settings reset to defaults",
      settings,
    });
  } catch (error) {
    console.error("Failed to run GAMDL action:", error);
    const details: GamdlConnectionTestDetails = {
      error_type: "action_error",
      gamdl_available: false,
      cookie_file_exists: false,
      cookie_file_valid: false,
      test_download_attempted: false,
      test_download_success: false,
    };

    return NextResponse.json(
      {
        error: "Failed to execute action",
        message: error instanceof Error ? error.message : String(error),
        details,
      },
      { status: 500 },
    );
  }
}
