import { NextResponse } from "next/server";
import { playlistDetailParamsSchema, playlistDetailResponseSchema } from "@/api-contract/schemas";
import { playlistManagementService } from "@/server/services/playlistManagementService";
import { resolveViewer } from "@/server/auth/viewer";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // A private playlist of someone else's is a 404, like a missing one (#1284).
    const viewer = await resolveViewer(request);
    const result = await playlistManagementService.getPlaylistTrackDetails(id, viewer.id);
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
