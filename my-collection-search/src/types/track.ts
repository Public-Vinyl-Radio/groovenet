import type { AlbumEntity, TrackEntity } from "@groovenet/contracts";
export type {
  Friend,
  LiveSetStatus,
  LiveSetCollaborator,
  LiveSetSummary,
  TrackGenre,
} from "@groovenet/contracts";

/**
 * The track wire entity from @groovenet/contracts. The wire schema is honest
 * about nulls and optionals; the UI treats the fields a search hit always
 * carries as present and never sees null for the link columns, so those are
 * narrowed here rather than in the contract.
 */
type TrackNarrowedKeys =
  | "id"
  | "year"
  | "album"
  | "duration"
  | "position"
  | "discogs_url"
  | "apple_music_url"
  | "youtube_url"
  | "spotify_url"
  | "soundcloud_url"
  | "album_thumbnail"
  | "local_audio_url"
  | "star_rating"
  | "isrc"
  | "bpm"
  | "notes"
  | "local_tags"
  | "composer"
  | "duration_seconds";
export type Track = Omit<TrackEntity, TrackNarrowedKeys> & {
  id: number;
  album: string;
  year: string | number;
  duration: string;
  position: string | number;
  discogs_url: string;
  apple_music_url: string;
  youtube_url?: string;
  spotify_url?: string;
  soundcloud_url?: string;
  album_thumbnail?: string;
  local_audio_url?: string;
  star_rating?: number;
  isrc?: string;
  bpm?: string | null;
  notes?: string | null;
  local_tags?: string;
  composer?: string | null;
  duration_seconds?: number;
  _semanticScore?: number; // Optional semantic score for AI recommendations
  _vectors?: { default?: number[] };
};

export type { YoutubeVideo } from "@groovenet/contracts";
export type { AppleMusicResult } from "@/types/apple";

export type { Playlist } from "@groovenet/contracts";

export type Album = Omit<
  AlbumEntity,
  "track_count" | "year" | "audio_file_album_art_url" | "discogs_url"
> & {
  track_count: number;
  year?: string | null;
  audio_file_album_art_url?: string;
  discogs_url?: string;
};
