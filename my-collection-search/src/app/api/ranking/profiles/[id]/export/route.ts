import { NextRequest, NextResponse } from "next/server";
import { exportRankingProfileFile } from "@groovenet/contracts";
import { analytics } from "@/lib/analytics/server";
import { profileAnalyticsId } from "@/lib/ranking/profiles";
import {
  rankingProfileService,
  RankingProfileError,
} from "@/server/services/rankingProfileService";
import { failure } from "../../../respond";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await rankingProfileService.get((await params).id);
    if (profile.invalid)
      throw new RankingProfileError("Profile can't be read; save it again before exporting", 400);
    const file = exportRankingProfileFile(profile);
    analytics.track(
      "ranking_profile_exported",
      { profile: profileAnalyticsId(profile), signal_count: Object.keys(file.weights).length },
      { request },
    );
    return NextResponse.json(file);
  } catch (error) {
    return failure(error, "Failed to export ranking profile");
  }
}
