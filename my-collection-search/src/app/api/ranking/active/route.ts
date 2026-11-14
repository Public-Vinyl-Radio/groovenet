/**
 * PUT { friend_id, profile_id, surfaces? } — choose the profile a library
 * ranks with (#1192), on the given surfaces or every surface it applies to.
 */
import { NextRequest, NextResponse } from "next/server";
import { rankingActiveResponseSchema, rankingActiveUpdateBodySchema } from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { profileAnalyticsId } from "@/lib/ranking/profiles";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, invalid, parseOr400, readJson } from "../respond";

export async function PUT(request: NextRequest) {
  const json = await readJson(request);
  if (!json) return invalid("Invalid JSON body");
  const body = parseOr400(rankingActiveUpdateBodySchema, json.value, "Invalid profile choice");
  if ("response" in body) return body.response;
  try {
    const { friend_id, profile_id, surfaces } = body.data;
    const result = await rankingProfileService.setActive(friend_id, profile_id, surfaces);
    analytics.track(
      "ranking_profile_chosen",
      {
        profile: profileAnalyticsId(result.profile),
        surfaces: surfaces ?? result.profile.surfaces,
      },
      { request },
    );
    return NextResponse.json(
      rankingActiveResponseSchema.parse({ friend_id: result.friend_id, active: result.active }),
    );
  } catch (error) {
    return failure(error, "Failed to choose ranking profile");
  }
}
