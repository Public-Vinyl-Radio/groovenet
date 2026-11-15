import { NextRequest, NextResponse } from "next/server";
import { rankingProfileFriendCopySchema, rankingProfileEntrySchema } from "@groovenet/contracts";
import { analytics } from "@/lib/analytics/server";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, invalid, parseOr400, readJson } from "../../../respond";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const json = await readJson(request);
  if (!json) return invalid("Invalid JSON body");
  const body = parseOr400(
    rankingProfileFriendCopySchema,
    json.value,
    "Invalid friend profile request",
  );
  if ("response" in body) return body.response;
  try {
    const profile = await rankingProfileService.useFriend(
      (await params).id,
      body.data.friend_id,
      body.data.source_friend_id,
    );
    analytics.track(
      "ranking_profile_used_from_friend",
      { profile: "custom", signal_count: Object.keys(profile.weights).length },
      { request },
    );
    return NextResponse.json(rankingProfileEntrySchema.parse(profile), { status: 201 });
  } catch (error) {
    return failure(error, "Failed to use friend's ranking profile");
  }
}
