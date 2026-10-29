import { NextRequest, NextResponse } from "next/server";
import {
  albumFriendQuerySchema,
  albumPlayableStructureResponseSchema,
} from "@/api-contract/schemas";
import { spinLoggingService } from "@/server/services/spinLoggingService";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  try {
    const { releaseId } = await params;
    const url = new URL(request.url);
    const parsedQuery = albumFriendQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
    });

    if (!releaseId || !parsedQuery.success) {
      return NextResponse.json(
        {
          error: "Missing or invalid required parameters",
          details: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
        },
        { status: 400 },
      );
    }

    const structure = await spinLoggingService.getAlbumPlayableStructure(
      releaseId,
      parsedQuery.data.friend_id,
    );

    if (!structure) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }

    return NextResponse.json(albumPlayableStructureResponseSchema.parse(structure));
  } catch (error) {
    console.error("Error fetching playable album structure:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch playable album structure",
      },
      { status: 500 },
    );
  }
}
