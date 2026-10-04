import { NextRequest, NextResponse } from "next/server";
import {
  embeddingsService,
  type EmbeddingPreviewType,
} from "@/server/services/embeddingsService";

const MISSING_AUDIO_ANALYSIS_ERROR = "Track missing audio analysis data";

function parsePreviewType(value: string | null): EmbeddingPreviewType {
  return value === "audio_vibe" || value === "context" ? value : "identity";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const trackId = (await params).id;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id");
    const previewType = parsePreviewType(request.nextUrl.searchParams.get("type"));
    const friendId = Number(friendIdRaw);
    if (!trackId || !friendId || Number.isNaN(friendId)) {
      return NextResponse.json(
        { error: "Missing required parameters: id and friend_id" },
        { status: 400 }
      );
    }

    const preview = await embeddingsService.getPreview(
      previewType,
      trackId,
      friendId
    );
    return NextResponse.json(preview);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === MISSING_AUDIO_ANALYSIS_ERROR
    ) {
      return NextResponse.json(
        {
          error: MISSING_AUDIO_ANALYSIS_ERROR,
          code: "missing_audio_analysis",
        },
        { status: 422 }
      );
    }
    console.error("Failed to build embedding preview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
