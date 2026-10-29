import { NextRequest, NextResponse } from "next/server";
import { settingsService } from "@/server/services/settingsService";

export async function GET(request: NextRequest) {
  const friendIdParam = request.nextUrl.searchParams.get("friend_id");
  const friendId = friendIdParam ? Number(friendIdParam) : undefined;

  try {
    if (friendIdParam && (!friendId || Number.isNaN(friendId))) {
      return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
    }

    const result = await settingsService.getAiPrompt(friendId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to load AI prompt settings:", err);
    return NextResponse.json({ error: "Failed to load AI prompt settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const friendId = Number(body?.friend_id);
    const prompt = String(body?.prompt ?? "");

    if (!friendId || Number.isNaN(friendId)) {
      return NextResponse.json({ error: "friend_id is required" }, { status: 400 });
    }

    const result = await settingsService.updateAiPrompt(friendId, prompt);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to update AI prompt settings:", err);
    return NextResponse.json({ error: "Failed to update AI prompt settings" }, { status: 500 });
  }
}
