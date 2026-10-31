import type { Track } from "@/types/track";

export { queueSummary, trackDurationLabel, trackMetaLine } from "@groovenet/client/player-session";

export function artworkOf(
  track:
    | { audio_file_album_art_url?: string | null; album_thumbnail?: string | null }
    | null
    | undefined,
): string | null {
  return track?.audio_file_album_art_url?.trim() || track?.album_thumbnail || null;
}

export function artworkAlt(track: Track | null | undefined): string {
  return track ? `${track.artist} - ${track.title}` : "Artwork";
}
