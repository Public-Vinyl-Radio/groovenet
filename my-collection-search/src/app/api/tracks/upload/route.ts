import { serviceNotRunning } from "@/lib/serviceConnection";
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeEssentiaAnalysis } from "@/lib/essentia-storage";
import { extractBpmConfidence, type EssentiaRhythm } from "@/lib/essentiaBpm";
import {
  extractKeyAnalysis,
  logKeyProfileDisagreement,
  type EssentiaTonal,
} from "@/lib/essentiaKey";
import { trackRepository } from "@/server/repositories/trackRepository";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";
import { trackAudioMetadataService } from "@/server/services/trackAudioMetadataService";
import { uploadStorageFor, type UploadStorage } from "@/server/services/uploadAudioFormat";

export const runtime = "nodejs"; // Ensure Node.js runtime for file system access

// execFile, never exec: arguments go to ffmpeg as an array, so nothing in an
// upload can reach a shell (#1155).
const execFileAsync = promisify(execFile);

type AnalysisResult = {
  rhythm?: EssentiaRhythm;
  tonal?: EssentiaTonal;
  metadata?: { audio_properties?: { length?: number } };
};

// Helper function to update database
async function processAudioFile(
  local_audio_url: string,
  track_id: string,
  friend_id: number | null,
  analysisResult: AnalysisResult,
): Promise<number[]> {
  const bpm = analysisResult?.rhythm?.bpm ? Math.round(analysisResult.rhythm.bpm) : null;
  const bpm_confidence = bpm === null ? null : extractBpmConfidence(analysisResult?.rhythm);
  const { key, key_confidence } = extractKeyAnalysis(analysisResult?.tonal);
  if (friend_id !== null) {
    logKeyProfileDisagreement(analysisResult?.tonal, { track_id, friend_id });
  }
  const danceability =
    typeof analysisResult?.rhythm?.danceability === "number"
      ? analysisResult.rhythm.danceability
      : null;
  const duration_seconds = analysisResult?.metadata?.audio_properties?.length
    ? Math.round(analysisResult.metadata.audio_properties.length)
    : null;

  await trackRepository.updateTrackAnalysisByTrackId(track_id, {
    local_audio_url,
    audio_source: "upload",
    bpm,
    bpm_confidence,
    key,
    key_confidence,
    danceability,
    duration_seconds,
  });

  // Fetch updated track
  const rows = await trackRepository.findTracksByTrackId(track_id);
  const friendIds = Array.from(new Set((rows ?? []).map((row) => row.friend_id)));
  if (rows && rows[0]) {
    try {
      await embeddingQueueService.enqueue(
        rows.flatMap((row) => [
          { track_id: row.track_id, friend_id: row.friend_id, kind: "identity" as const },
          { track_id: row.track_id, friend_id: row.friend_id, kind: "context" as const },
          { track_id: row.track_id, friend_id: row.friend_id, kind: "audio_vibe" as const },
        ]),
      );
    } catch (queueError) {
      console.error("Failed to enqueue embedding jobs after upload:", queueError);
    }
  }
  return friendIds;
}

// The DB analysis above applies to every friend row sharing the track_id, so
// the raw file is written for each of them (plus the requesting friend, in case
// the DB update failed). A write failure is logged, not fatal: the analysis is
// already in Postgres and the debug view is the only reader of the file.
function persistRawAnalysis(
  track_id: string,
  friendIds: number[],
  requestedFriendId: number | null,
  analysisResult: AnalysisResult,
) {
  const targets = new Set(friendIds);
  if (requestedFriendId !== null) targets.add(requestedFriendId);
  for (const friend_id of targets) {
    try {
      writeEssentiaAnalysis(track_id, friend_id, analysisResult);
    } catch (saveErr) {
      console.error(
        `Failed to persist Essentia analysis file (track_id=${track_id}, friend_id=${friend_id}):`,
        saveErr,
      );
    }
  }
}

/** Lossless to FLAC, keeping tags and an embedded cover. */
function flacArgs(input: string, output: string): string[] {
  return [
    "-y",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-map",
    "0:v?",
    "-map_metadata",
    "0",
    "-c:a",
    "flac",
    "-c:v",
    "copy",
    output,
  ];
}

async function storeUpload(storage: UploadStorage, uploadPath: string, dest: string) {
  if (storage.action === "keep") {
    // Copy, not rename: the audio directory is usually a separate volume.
    await fs.copyFile(uploadPath, dest);
  } else {
    await execFileAsync("ffmpeg", flacArgs(uploadPath, dest));
  }
}

async function removeIfPresent(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn("Cleanup warning:", err);
    }
  }
}

export async function POST(req: NextRequest) {
  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get("file");
  const track_id = formData.get("track_id");
  const friend_id = formData.get("friend_id");
  const friendIdNum =
    typeof friend_id === "string" && friend_id.trim() !== "" ? Number(friend_id) : NaN;
  const friendId = Number.isNaN(friendIdNum) ? null : friendIdNum;

  if (!file || typeof file === "string" || !track_id || typeof track_id !== "string") {
    return NextResponse.json({ error: "Missing file or track_id" }, { status: 400 });
  }

  // track_id is client input: it must name a track before anything uses it.
  const existing = await trackRepository.findTracksByTrackId(track_id);
  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Every path below is generated; neither file.name nor track_id is part of one.
  const baseName = `audio_${Date.now()}_${randomUUID()}`;
  const tmpDir = path.join(process.cwd(), "tmp", "uploads");
  const audioDir = process.env.AUDIO_DIR || path.join(process.cwd(), "audio");
  const uploadPath = path.join(tmpDir, `${baseName}.upload`);
  const wavFileName = `${baseName}.wav`;
  const wavDest = path.join(audioDir, wavFileName);

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

    // What is stored is decided from the content, never the filename.
    let storage: UploadStorage | null;
    try {
      storage = uploadStorageFor(await trackAudioMetadataService.runFfprobe(uploadPath));
    } catch {
      return NextResponse.json({ error: "File is not readable audio" }, { status: 400 });
    }
    if (!storage) {
      return NextResponse.json({ error: "Unsupported audio format" }, { status: 415 });
    }

    // Mono WAV for Essentia, served to it through /api/audio.
    try {
      await execFileAsync("ffmpeg", ["-y", "-i", uploadPath, "-ac", "1", wavDest]);
    } catch (err) {
      return NextResponse.json(
        { error: "ffmpeg conversion failed", details: String(err) },
        { status: 500 },
      );
    }

    let analysisResult: AnalysisResult;
    try {
      const essentiaApiUrl = process.env.ESSENTIA_API_URL || "http://essentia:8001/analyze";
      const fileUrl = `http://app:3000/api/audio?filename=${encodeURIComponent(wavFileName)}`;
      const res = await fetch(essentiaApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: fileUrl }),
      });
      const responseText = await res.json();
      if (!res.ok) {
        throw new Error(`Essentia API error: ${res.status} ${JSON.stringify(responseText)}`);
      }
      analysisResult = responseText;
    } catch (err) {
      if (serviceNotRunning(err)) {
        return NextResponse.json({ error: "Essentia service not running" }, { status: 503 });
      }
      return NextResponse.json(
        {
          error: `Essentia API call failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }

    const local_audio_url = `${baseName}.${storage.extension}`;
    const audioDest = path.join(audioDir, local_audio_url);
    try {
      await storeUpload(storage, uploadPath, audioDest);
    } catch (err) {
      console.error("Storing the uploaded audio failed:", err);
      await removeIfPresent(audioDest);
      return NextResponse.json(
        { error: "Storing the uploaded audio failed", details: String(err) },
        { status: 500 },
      );
    }

    // Update database
    let friendIds: number[] = [];
    try {
      friendIds = await processAudioFile(local_audio_url, track_id, friendId, analysisResult);
    } catch (err) {
      console.warn("Could not update track with local_audio_url:", err);
    }

    // After the DB update so a file error can never undo it.
    persistRawAnalysis(track_id, friendIds, friendId, analysisResult);

    return NextResponse.json({
      success: true,
      file: file.name,
      track_id,
      analysis: analysisResult,
      local_audio_url,
      format: storage.extension,
      lossless: storage.lossless,
    });
  } finally {
    await removeIfPresent(uploadPath);
    await removeIfPresent(wavDest);
  }
}
