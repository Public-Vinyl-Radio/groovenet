import { NextRequest, NextResponse } from "next/server";
import { gamdlSettingsPutBodySchema } from "@/api-contract/schemas";
import { settingsService } from "@/server/services/settingsService";

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
    const { friend_id, ...rest } = body as { friend_id?: number | string } & Record<
      string,
      unknown
    >;

    if (!friend_id) {
      return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
    }

    const friendIdNum = Number(friend_id);
    if (!friendIdNum || Number.isNaN(friendIdNum)) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    if (Object.keys(rest).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Unknown fields are stripped, as the repository always dropped them.
    const parsed = gamdlSettingsPutBodySchema.safeParse({ ...rest, friend_id: friendIdNum });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid gamdl settings", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { friend_id: _friendId, ...updates } = parsed.data;
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
