import { NextRequest, NextResponse } from "next/server";
import { settingsService } from "@/server/services/settingsService";
import type { GamdlSettingsUpdate } from "@/types/gamdl";

export const runtime = "nodejs";

/**
 * GET /api/settings/gamdl?friend_id=123
 * Get gamdl settings for a specific friend
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const friendId = searchParams.get("friend_id");

  if (!friendId) {
    return NextResponse.json({ error: "friend_id parameter is required" }, { status: 400 });
  }

  try {
    const settings = await settingsService.getGamdlSettings(Number(friendId));

    return NextResponse.json({
      settings,
    });
  } catch (error) {
    console.error("Failed to get gamdl settings:", error);
    return NextResponse.json(
      {
        error: "Failed to get gamdl settings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings/gamdl
 * Update gamdl settings for a specific friend
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { friend_id, ...updates } = body as {
      friend_id?: number | string;
    } & GamdlSettingsUpdate;

    if (!friend_id) {
      return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
    }

    const friendIdNum = Number(friend_id);
    if (!friendIdNum || Number.isNaN(friendIdNum)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const settings = await settingsService.updateGamdlSettings(friendIdNum, updates);
    if (!settings) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Failed to update gamdl settings:", error);
    return NextResponse.json(
      {
        error: "Failed to update gamdl settings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
