import { NextRequest, NextResponse } from "next/server";
import {
  recommendationSettingsPutBodySchema,
  recommendationSettingsQuerySchema,
  recommendationSettingsResponseSchema,
} from "@/api-contract/schemas";
import { settingsService } from "@/server/services/settingsService";

/** A library's suggestion scope: only its own tracks, or every library. */
export async function GET(request: NextRequest) {
  const parsed = recommendationSettingsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "friend_id is required", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await settingsService.getRecommendationSettings(parsed.data.friend_id);
    return NextResponse.json(recommendationSettingsResponseSchema.parse(result));
  } catch (err) {
    console.error("Failed to load recommendation settings:", err);
    return NextResponse.json(
      { error: "Failed to load recommendation settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = recommendationSettingsPutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "friend_id and scope ('library' or 'all') are required", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await settingsService.updateRecommendationSettings(
      parsed.data.friend_id,
      parsed.data.scope
    );
    return NextResponse.json(recommendationSettingsResponseSchema.parse(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/does not exist/.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Failed to update recommendation settings:", err);
    return NextResponse.json(
      { error: "Failed to update recommendation settings" },
      { status: 500 }
    );
  }
}
