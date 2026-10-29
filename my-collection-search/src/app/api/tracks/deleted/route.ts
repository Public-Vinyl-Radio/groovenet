import { NextRequest, NextResponse } from "next/server";
import { trackRepository } from "@/server/repositories/trackRepository";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const friendIdRaw = sp.get("friend_id")?.trim();
    let friend_id: number | undefined;
    if (friendIdRaw) {
      friend_id = Number(friendIdRaw);
      if (!Number.isFinite(friend_id)) {
        return NextResponse.json({ error: "friend_id must be a number" }, { status: 400 });
      }
    }

    const limitRaw = sp.get("limit")?.trim();
    const offsetRaw = sp.get("offset")?.trim();
    const limit = limitRaw ? Number(limitRaw) : 100;
    const offset = offsetRaw ? Number(offsetRaw) : 0;
    if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
      return NextResponse.json({ error: "limit and offset must be numbers" }, { status: 400 });
    }

    const result = await trackRepository.findDeletedTracks(friend_id, limit, offset);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error listing deleted tracks:", error);
    return NextResponse.json({ error: "Failed to list deleted tracks" }, { status: 500 });
  }
}
