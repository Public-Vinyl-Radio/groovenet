import path from "node:path";
import type {
  TrackAudioFile,
  TrackAudioFileFields,
  TrackAudioFilesBackfillResponse,
} from "@groovenet/contracts";
import { trackAudioFileRepository } from "@/server/repositories/trackAudioFileRepository";
import { trackAudioMetadataService } from "@/server/services/trackAudioMetadataService";

/**
 * Which audio files a track has (#1310).
 *
 * `tracks.local_audio_url` is the primary file: playback, analysis, fingerprint
 * indexing and exports all read it, so only one file per track is ever analysed
 * or indexed. The files here are alternates of the same recording (an AAC kept
 * beside a lossless FLAC), linked so nothing on disk is orphaned.
 */
export type PrimaryAudio = { local_audio_url?: string | null } & TrackAudioFileFields;

function primaryFile(track: PrimaryAudio): TrackAudioFile | null {
  const filename = track.local_audio_url?.trim();
  if (!filename) return null;
  return {
    filename,
    primary: true,
    container: track.audio_container,
    codec: track.audio_codec,
    lossless: track.audio_lossless,
    sample_rate: track.audio_sample_rate,
    bit_depth: track.audio_bit_depth,
    bitrate: track.audio_bitrate,
    channels: track.audio_channels,
    size_bytes: track.audio_size_bytes,
    source: track.audio_source,
  };
}

export class AlternateAudioError extends Error {}

export const trackAudioFileService = {
  /** Primary first, then each alternate; empty when the track has no audio. */
  async listFiles(track: PrimaryAudio & { track_id: string; friend_id: number }) {
    const primary = primaryFile(track);
    const alternates = await trackAudioFileRepository.listAlternates(
      track.track_id,
      track.friend_id,
    );
    return primary ? [primary, ...alternates] : alternates;
  },

  /**
   * Probe `filename` and link it as an alternate of the track. Returns true when
   * the link is new. The primary is never linked as its own alternate.
   */
  async linkAlternate(
    track: { track_id: string; friend_id: number; local_audio_url?: string | null },
    filename: string,
    source?: TrackAudioFileFields["audio_source"],
  ): Promise<boolean> {
    const name = trackAudioMetadataService.normalizeAudioFilename(filename);
    if (!name) throw new AlternateAudioError("alternate_audio_url is empty");
    const primary = track.local_audio_url
      ? trackAudioMetadataService.normalizeAudioFilename(track.local_audio_url)
      : null;
    if (name === primary) {
      throw new AlternateAudioError("alternate_audio_url is already the primary audio file");
    }
    // Throws "Local audio file not found" when the file is not on the volume.
    const { fields } = await trackAudioMetadataService.inspectLocalAudio(name, source);
    return trackAudioFileRepository.upsert(track.track_id, track.friend_id, name, fields);
  },

  /**
   * Link `<stem>.m4a` files sitting beside a linked `<stem>.flac`. Needs the audio
   * volume, so it runs in the app rather than in a migration. Idempotent: an
   * existing link is a refresh and is counted as already linked.
   */
  async backfillSiblingAlternates(): Promise<TrackAudioFilesBackfillResponse> {
    const candidates = await trackAudioFileRepository.listFlacPrimaries();
    const result = { scanned: candidates.length, linked: 0, already_linked: 0, failed: 0 };
    for (const candidate of candidates) {
      const primary = trackAudioMetadataService.normalizeAudioFilename(candidate.local_audio_url);
      const sibling = `${primary.slice(0, -path.extname(primary).length)}.m4a`;
      const resolved = trackAudioMetadataService.resolveAudioFilePath(sibling);
      if (!resolved) continue;
      try {
        const created = await this.linkAlternate(candidate, sibling, candidate.audio_source);
        if (created) result.linked++;
        else result.already_linked++;
      } catch (error) {
        console.error(`[audio-files] could not link ${sibling}:`, error);
        result.failed++;
      }
    }
    return result;
  },
};
