import { NextResponse } from "next/server";
import { analytics } from "@/lib/analytics/server";
import {
  playlistSchema,
  playlistCreateBodySchema,
  playlistDeleteQuerySchema,
  playlistPatchBodySchema,
} from "@/api-contract/schemas";
import {
  normalizePlaylistCreatedAt,
  playlistManagementService,
} from "@/server/services/playlistManagementService";
import { playlistRepository } from "@/server/repositories/playlistRepository";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsedQuery = playlistDeleteQuerySchema.safeParse({
      id: searchParams.get("id"),
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Missing playlist id", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { id } = parsedQuery.data;
    const deletedPlaylist = await playlistRepository.deletePlaylistById(id);
    if (!deletedPlaylist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    analytics.track(
      "playlist_deleted",
      { playlist_id: id, playlist_name: deletedPlaylist?.name, source: "api" },
      { request: req }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting playlist:", error);
    return NextResponse.json(
      { error: "Failed to delete playlist" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const playlists = await playlistManagementService.getAllPlaylistsWithTracks();
    const validated = playlistSchema.array().safeParse(playlists);
    if (!validated.success) {
      console.warn(
        "Playlists response failed schema validation; returning raw payload for compatibility",
        validated.error.flatten()
      );
      return NextResponse.json(playlists);
    }
    return NextResponse.json(validated.data);
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const parsedBody = playlistCreateBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid playlist payload", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { name, tracks } = parsedBody.data;
    const playlist = await playlistManagementService.createPlaylistWithTracks({
      name,
      tracks,
    });

    analytics.track(
      "playlist_created",
      {
        playlist_id: playlist.id,
        playlist_name: playlist.name,
        track_count: playlist.tracks?.length ?? 0,
        source: "api",
      },
      { request: req }
    );

    const validated = playlistSchema.parse(normalizePlaylistCreatedAt(playlist));
    return NextResponse.json(validated, { status: 201 });
  } catch (error) {
    console.error("Error creating playlist:", error);
    return NextResponse.json(
      { error: "Failed to create playlist" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const parsedBody = playlistPatchBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Invalid playlist update payload",
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await playlistManagementService.updatePlaylist(parsedBody.data);
    if (result.notFound) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const validated = playlistSchema.parse(result.playlist);
    return NextResponse.json(validated);
  } catch (error) {
    console.error("Error updating playlist:", error);
    return NextResponse.json(
      { error: "Failed to update playlist" },
      { status: 500 }
    );
  }
}
