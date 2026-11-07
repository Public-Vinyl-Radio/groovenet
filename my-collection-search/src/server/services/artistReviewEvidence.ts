import type { ArtistReviewDetail } from "@/api-contract/artistReview";
import { getReleasePath, loadAlbum } from "./discogsManifestService";
import { trackAudioMetadataService as audio } from "./trackAudioMetadataService";

/** Read-only, bounded evidence from local sources. Missing files never hide the queue. */
export async function artistReviewEvidence(item: ArtistReviewDetail): Promise<void> {
  for (const album of item.albums) {
    const path = getReleasePath(String(album.username), String(album.release_id));
    const raw = path ? loadAlbum(path) : null;
    album.discogs = raw ? { artists: raw.artists, tracklist: raw.tracklist } : null;
  }
  for (const track of item.tracks.slice(0, 5)) {
    track.apple_tags = null;
    if (track.audio_source !== "apple_music" || typeof track.local_audio_url !== "string") continue;
    try {
      const path = audio.resolveAudioFilePath(track.local_audio_url);
      if (!path) continue;
      const probe = await audio.runFfprobe(
        path,
        "format_tags=artist,album_artist,sort_artist,composer,compilation",
      );
      track.apple_tags =
        (probe as { format?: { tags?: Record<string, string> } }).format?.tags ?? null;
    } catch {
      track.evidence_error = "Local Apple tags unavailable";
    }
  }
}
