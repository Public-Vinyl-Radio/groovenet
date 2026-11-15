/**
 * POST { friend_id, name? } — copy a preset or a stored profile into the
 * library's own profiles (#1192). How a preset is tuned: copy it, then edit.
 */
import { NextRequest, NextResponse } from "next/server";
import { rankingProfileCopyBodySchema, rankingProfileSchema } from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { profileAnalyticsId } from "@/lib/ranking/profiles";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, invalid, parseOr400, readJson } from "../../../respond";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const json = await readJson(request);
  if (!json) return invalid("Invalid JSON body");
  const body = parseOr400(rankingProfileCopyBodySchema, json.value, "Invalid copy request");
  if ("response" in body) return body.response;
  try {
    const sourceId = (await params).id;
    const source = await rankingProfileService.get(sourceId);
    const profile = await rankingProfileService.copy(sourceId, body.data.friend_id, body.data.name);
    analytics.track(
      "ranking_profile_edited",
      { action: "copied", profile: "custom", from: profileAnalyticsId(source) },
      { request },
    );
    return NextResponse.json(rankingProfileSchema.parse(profile), { status: 201 });
  } catch (error) {
    return failure(error, "Failed to copy ranking profile");
  }
}
