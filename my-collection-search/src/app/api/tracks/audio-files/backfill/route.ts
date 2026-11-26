import { NextResponse } from "next/server";
import { trackAudioFilesBackfillResponseSchema } from "@groovenet/contracts";
import { trackAudioFileService } from "@/server/services/trackAudioFileService";

/**
 * Link the AAC files orphaned beside a lossless FLAC (#1310): every `<stem>.m4a`
 * next to a linked `<stem>.flac`. Synchronous (a stat per FLAC track) and
 * idempotent, so a second run links nothing.
 */
export async function POST() {
  try {
    const result = await trackAudioFileService.backfillSiblingAlternates();
    return NextResponse.json(trackAudioFilesBackfillResponseSchema.parse(result));
  } catch (error) {
    console.error("Error linking alternate audio files:", error);
    return NextResponse.json({ error: "Failed to link alternate audio files" }, { status: 500 });
  }
}
