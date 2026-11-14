/**
 * One ranking profile (#1192): a preset or a stored profile's id.
 * GET — the profile. PUT { profile } — replace a stored profile; presets are
 * read-only (403). DELETE — remove a stored profile; surfaces that chose it go
 * back to Default.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  rankingProfileDeleteResponseSchema,
  rankingProfileEntrySchema,
  rankingProfileSchema,
  rankingProfileUpdateBodySchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, invalid, parseOr400, readJson } from "../../respond";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const profile = await rankingProfileService.get((await params).id);
    return NextResponse.json(rankingProfileEntrySchema.parse(profile));
  } catch (error) {
    return failure(error, "Failed to load ranking profile");
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const json = await readJson(request);
  if (!json) return invalid("Invalid JSON body");
  const body = parseOr400(rankingProfileUpdateBodySchema, json.value, "Invalid ranking profile");
  if ("response" in body) return body.response;
  try {
    const profile = await rankingProfileService.update((await params).id, body.data.profile);
    analytics.track(
      "ranking_profile_edited",
      { action: "updated", profile: "custom", from: "custom" },
      { request },
    );
    return NextResponse.json(rankingProfileSchema.parse(profile));
  } catch (error) {
    return failure(error, "Failed to update ranking profile");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const profile = await rankingProfileService.remove((await params).id);
    analytics.track(
      "ranking_profile_edited",
      { action: "deleted", profile: "custom", from: "custom" },
      { request },
    );
    return NextResponse.json(
      rankingProfileDeleteResponseSchema.parse({ deleted: true, id: profile.id }),
    );
  } catch (error) {
    return failure(error, "Failed to delete ranking profile");
  }
}
