import { NextResponse } from "next/server";
import { playlistDetailParamsSchema, playlistDetailResponseSchema } from "@/api-contract/schemas";
import { playlistManagementService } from "@/server/services/playlistManagementService";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idParam } = await params;
    const parsedParams = playlistDetailParamsSchema.safeParse({ id: idParam });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid playlist id", details: parsedParams.error.flatten() },
        { status: 400 },
      );
    }
    const id = parsedParams.data.id;

    const result = await playlistManagementService.getPlaylistTrackDetails(id);
    if (result.notFound) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const validated = playlistDetailResponseSchema.parse(result.detail);
    return NextResponse.json(validated);
  } catch (error) {
    console.error("Error fetching playlist tracks:", error);
    return NextResponse.json({ error: "Failed to fetch playlist tracks" }, { status: 500 });
  }
}
