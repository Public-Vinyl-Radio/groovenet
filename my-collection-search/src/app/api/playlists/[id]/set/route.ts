import { NextResponse } from "next/server";
import { playlistDetailParamsSchema } from "@/api-contract/schemas";
import { liveSetService } from "@/server/services/liveSetService";
import type { LiveSetUpdate } from "@/server/repositories/liveSetRepository";

async function parsePlaylistId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return playlistDetailParamsSchema.safeParse({ id });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success) return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const set = await liveSetService.getByPlaylistId(parsed.data.id);
    return set ? NextResponse.json(set) : NextResponse.json({ error: "Set not found" }, { status: 404 });
  } catch (error) {
    console.error("Error fetching set:", error);
    return NextResponse.json({ error: "Failed to fetch set" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success) return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const set = await liveSetService.createForPlaylist(parsed.data.id);
    return set
      ? NextResponse.json({ id: set.id, playlist_id: set.playlist_id }, { status: 201 })
      : NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  } catch (error) {
    console.error("Error creating set:", error);
    return NextResponse.json({ error: "Failed to create set" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success) return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const update = await request.json() as LiveSetUpdate;
    if (update.status && !["draft", "performed", "archived"].includes(update.status)) {
      return NextResponse.json({ error: "Invalid set status" }, { status: 400 });
    }
    const set = await liveSetService.updateForPlaylist(parsed.data.id, update);
    return set
      ? NextResponse.json({ id: set.id, playlist_id: set.playlist_id })
      : NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  } catch (error) {
    console.error("Error updating set:", error);
    return NextResponse.json({ error: "Failed to update set" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parsePlaylistId(params);
    if (!parsed.success) return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    const deleted = await liveSetService.deleteForPlaylist(parsed.data.id);
    return deleted ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Set not found" }, { status: 404 });
  } catch (error) {
    console.error("Error deleting set:", error);
    return NextResponse.json({ error: "Failed to delete set" }, { status: 500 });
  }
}
