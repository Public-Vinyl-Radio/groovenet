import { NextRequest, NextResponse } from "next/server";
import {
  aiPromptSettingsGetResponseSchema,
  aiPromptSettingsPutBodySchema,
  aiPromptSettingsPutResponseSchema,
} from "@/api-contract/schemas";
import { settingsService } from "@/server/services/settingsService";

export async function GET(request: NextRequest) {
  const friendIdParam = request.nextUrl.searchParams.get("friend_id");
  const friendId = friendIdParam ? Number(friendIdParam) : undefined;

  try {
    if (friendIdParam && (!friendId || Number.isNaN(friendId))) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const result = await settingsService.getAiPrompt(friendId);
    return NextResponse.json(aiPromptSettingsGetResponseSchema.parse(result));
  } catch (err) {
    console.error("Failed to load AI prompt settings:", err);
    return NextResponse.json({ error: "Failed to load AI prompt settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    // The route has always coerced with Number()/String(); the schema then
    // checks the result (a fractional id is now a 400, not a Postgres 500).
    const parsed = aiPromptSettingsPutBodySchema.safeParse({
      friend_id: Number(body?.friend_id),
      prompt: String(body?.prompt ?? ""),
    });

    if (!parsed.success || !parsed.data.friend_id) {
      return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
    }

    const result = await settingsService.updateAiPrompt(parsed.data.friend_id, parsed.data.prompt);
    return NextResponse.json(aiPromptSettingsPutResponseSchema.parse(result));
  } catch (err) {
    console.error("Failed to update AI prompt settings:", err);
    return NextResponse.json({ error: "Failed to update AI prompt settings" }, { status: 500 });
  }
}
