import { trackExtractEmbeddedCoverResponseSchema } from "@/api-contract/schemas";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
import { trackRepository } from "@/server/repositories/trackRepository";
import { albumRepository } from "@/server/repositories/albumRepository";
import { trackAudioMetadataService } from "@/server/services/trackAudioMetadataService";

const execFileAsync = promisify(execFile);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trackId = (await params).id;
    const friendIdRaw = request.nextUrl.searchParams.get("friend_id");
    const friendId = Number(friendIdRaw);
    if (!trackId || !friendId || Number.isNaN(friendId)) {
      return NextResponse.json(
        { error: "Missing required parameters: track_id and friend_id" },
        { status: 400 },
      );
    }

    const track = await trackRepository.findTrackAudioMetadata(trackId, friendId);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    if (!track.local_audio_url) {
      return NextResponse.json({ error: "Track has no local_audio_url" }, { status: 404 });
    }

    const audioPath = trackAudioMetadataService.resolveAudioFilePath(track.local_audio_url);
    if (!audioPath) {
      return NextResponse.json({ error: "Local audio file not found" }, { status: 404 });
    }

    const probe = await trackAudioMetadataService.runFfprobe(audioPath);
    const attachedPic = trackAudioMetadataService.getAttachedPicStream(probe);

    return NextResponse.json({
      track_id: track.track_id,
      friend_id: track.friend_id,
      local_audio_url: track.local_audio_url,
      audio_file_album_art_url: track.audio_file_album_art_url,
      has_embedded_cover: !!attachedPic,
      embedded_cover: attachedPic
        ? {
            index: attachedPic.index,
            codec_name: attachedPic.codec_name,
            width: attachedPic.width,
            height: attachedPic.height,
            pix_fmt: attachedPic.pix_fmt,
          }
        : null,
      probe,
    });
  } catch (error) {
    console.error("Error reading audio metadata:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trackId = (await params).id;
    const body = await request.json().catch(() => ({}));
    const friendId = Number(body?.friend_id);
    if (!trackId || !friendId || Number.isNaN(friendId)) {
      return NextResponse.json(
        { error: "Missing required parameters: track_id and friend_id" },
        { status: 400 },
      );
    }

    const track = await trackRepository.findTrackAudioMetadata(trackId, friendId);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    if (!track.local_audio_url) {
      return NextResponse.json({ error: "Track has no local_audio_url" }, { status: 404 });
    }

    const audioPath = trackAudioMetadataService.resolveAudioFilePath(track.local_audio_url);
    if (!audioPath) {
      return NextResponse.json({ error: "Local audio file not found" }, { status: 404 });
    }

    const probe = await trackAudioMetadataService.runFfprobe(audioPath);
    const attachedPic = trackAudioMetadataService.getAttachedPicStream(probe);
    if (!attachedPic) {
      return NextResponse.json(
        { error: "No embedded cover art found in audio file" },
        { status: 404 },
      );
    }

    const outputDir = path.join(process.cwd(), "public", "uploads", "album-covers");
    fs.mkdirSync(outputDir, { recursive: true });
    const safeTrackId = trackId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outputFile = `${safeTrackId}_${friendId}.jpg`;
    const outputPath = path.join(outputDir, outputFile);

    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      audioPath,
      "-map",
      `0:${attachedPic.index}`,
      "-frames:v",
      "1",
      outputPath,
    ]);

    const publicUrl = `/uploads/album-covers/${outputFile}`;
    const releaseId = track.release_id;

    if (releaseId) {
      await Promise.all([
        albumRepository.updateAlbumCoverForRelease(friendId, releaseId, publicUrl),
        albumRepository.updateAlbumAudioFileAlbumArtUrl(releaseId, friendId, publicUrl),
      ]);
    } else {
      await trackRepository.updateTrackAudioFileAlbumArtUrl(trackId, friendId, publicUrl);
    }

    return NextResponse.json(
      trackExtractEmbeddedCoverResponseSchema.parse({
        success: true,
        audio_file_album_art_url: publicUrl,
        message: releaseId
          ? "Extracted embedded cover and updated all tracks on the album."
          : "Extracted embedded cover and saved to track.",
      }),
    );
  } catch (error) {
    console.error("Error extracting embedded audio cover:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
