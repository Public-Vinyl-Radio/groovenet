/**
 * Ranking profiles (#1192).
 * GET  ?friend_id=N — presets, then the library's own profiles, and the profile active per surface.
 * POST { friend_id, profile } — store a new profile; an invalid profile is a 400.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  rankingProfileCreateBodySchema,
  rankingProfileSchema,
  rankingProfilesListQuerySchema,
  rankingProfilesResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, parseOr400, readJson, invalid } from "../respond";

export async function GET(request: NextRequest) {
  const query = parseOr400(
    rankingProfilesListQuerySchema,
    Object.fromEntries(request.nextUrl.searchParams.entries()),
    "friend_id is required",
  );
  if ("response" in query) return query.response;
  try {
    const result = await rankingProfileService.list(query.data.friend_id);
    return NextResponse.json(rankingProfilesResponseSchema.parse(result));
  } catch (error) {
    return failure(error, "Failed to list ranking profiles");
  }
}

export async function POST(request: NextRequest) {
  const json = await readJson(request);
  if (!json) return invalid("Invalid JSON body");
  const body = parseOr400(rankingProfileCreateBodySchema, json.value, "Invalid ranking profile");
  if ("response" in body) return body.response;
  try {
    const profile = await rankingProfileService.create(body.data.friend_id, body.data.profile);
    analytics.track(
      "ranking_profile_edited",
      { action: "created", profile: "custom", from: "custom" },
      { request },
    );
    return NextResponse.json(rankingProfileSchema.parse(profile), { status: 201 });
  } catch (error) {
    return failure(error, "Failed to create ranking profile");
  }
}
