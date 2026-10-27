import type { Track } from "@/types/track";

export { queueSummary, trackDurationLabel, trackMetaLine } from "@groovenet/client/player-session";

export function artworkOf(track: Track | null | undefined): string | null {
  return track?.audio_file_album_art_url || track?.album_thumbnail || null;
}

export function artworkAlt(track: Track | null | undefined): string {
  return track ? `${track.artist} - ${track.title}` : "Artwork";
}
