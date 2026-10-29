import { NextResponse } from "next/server";
import {
  liveSetDeleteSchema,
  liveSetMutationSchema,
  liveSetResponseSchema,
  liveSetUpdateBodySchema,
  playlistDetailParamsSchema,
} from "@/api-contract/schemas";
import { liveSetService } from "@/server/services/liveSetService";

async function parsePlaylistId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return playlistDetailParamsSchema.safeParse({ id });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const set = await liveSetService.getByPlaylistId(parsed.data.id);
    if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });
    const response = liveSetResponseSchema.safeParse({
      ...set,
      performances: set.performances.map((performance) => ({
        ...performance,
        performed_at:
          performance.performed_at instanceof Date
            ? performance.performed_at.toISOString()
            : performance.performed_at,
      })),
    });
    if (!response.success) throw new Error("Invalid live set response");
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error fetching set:", error);
    return NextResponse.json({ error: "Failed to fetch set" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const set = await liveSetService.createForPlaylist(parsed.data.id);
    if (!set) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    const response = liveSetMutationSchema.safeParse({ id: set.id, playlist_id: set.playlist_id });
    if (!response.success) throw new Error("Invalid live set creation response");
    return NextResponse.json(response.data, { status: 201 });
  } catch (error) {
    console.error("Error creating set:", error);
    return NextResponse.json({ error: "Failed to create set" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const parsedUpdate = liveSetUpdateBodySchema.safeParse(await request.json());
    if (!parsedUpdate.success) {
      const invalidStatus = parsedUpdate.error.issues.some((issue) => issue.path[0] === "status");
      return NextResponse.json(
        { error: invalidStatus ? "Invalid set status" : "Invalid set details" },
        { status: 400 },
      );
    }
    const set = await liveSetService.updateForPlaylist(parsed.data.id, parsedUpdate.data);
    if (!set) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    const response = liveSetMutationSchema.safeParse({ id: set.id, playlist_id: set.playlist_id });
    if (!response.success) throw new Error("Invalid live set update response");
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error updating set:", error);
    return NextResponse.json({ error: "Failed to update set" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const deleted = await liveSetService.deleteForPlaylist(parsed.data.id);
    if (!deleted) return NextResponse.json({ error: "Set not found" }, { status: 404 });
    const response = liveSetDeleteSchema.safeParse({ success: true });
    if (!response.success) throw new Error("Invalid live set deletion response");
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error deleting set:", error);
    return NextResponse.json({ error: "Failed to delete set" }, { status: 500 });
  }
}
