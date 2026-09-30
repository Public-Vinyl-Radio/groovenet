import { NextResponse } from "next/server";
import { redisJobService } from "@/server/services/redisJobService";
import { analytics } from "@/lib/analytics/server";
import { albumRepository } from "@/server/repositories/albumRepository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const { releaseId } = await params;
    const { searchParams } = new URL(request.url);
    const friendId = parseInt(searchParams.get("friend_id") || "0");

    if (!friendId) {
      return NextResponse.json(
        { error: "friend_id parameter is required" },
        { status: 400 }
      );
    }

    // Get all tracks for this album that are missing local_audio_url
    // and have at least one music service URL
    const tracks = await albumRepository.getTracksForAlbumDownloadQueue(
      releaseId,
      friendId
    );

    if (tracks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No tracks need downloading",
        jobIds: [],
        tracksQueued: 0,
      });
    }

    // Enqueue download job for each track
    const jobIds: string[] = [];
    for (const track of tracks) {
      const jobId = await redisJobService.createDownloadJob({
        track_id: track.track_id,
        friend_id: track.friend_id,
        apple_music_url: track.apple_music_url || undefined,
        youtube_url: track.youtube_url || undefined,
        soundcloud_url: track.soundcloud_url || undefined,
        title: track.title || undefined,
        artist: track.artist || undefined,
      });
      jobIds.push(jobId);
    }

    console.log(
      `Queued ${jobIds.length} download jobs for album ${releaseId}`
    );

    analytics.track(
      "album_download_queued",
      {
        release_id: releaseId,
        friend_id: friendId,
        track_count: jobIds.length,
      },
      { request }
    );

    return NextResponse.json({
      success: true,
      message: `Queued ${jobIds.length} track${jobIds.length === 1 ? "" : "s"} for download`,
      jobIds,
      tracksQueued: jobIds.length,
    });
  } catch (error) {
    console.error("Error enqueuing album downloads:", error);
    return NextResponse.json(
      {
        error: "Failed to enqueue downloads",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
