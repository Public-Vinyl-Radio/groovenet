import type { DiscogsSimpleArtist, DiscogsVideo } from "@/types/discogs";
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

export type YoutubeVideo = {
  id: string;
  title: string;
  channel: string;
  thumbnail?: string;
  url: string;
};

export type AppleMusicResult = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
  url: string;
  duration?: number;
};

export type { Playlist } from "@groovenet/contracts";

export interface DiscogsRelease {
  id: number | string;
  title: string;
  artists?: { name: string }[];
  artists_sort?: string;
  year?: number;
  styles?: string[];
  genres?: string[];
  uri?: string;
  thumb?: string;
  videos?: DiscogsVideo[];
  tracklist: ProcessedTrack[];
  date_added: string;
  date_changed: string;
  labels?: Array<{ name: string; catno: string }>;
  country?: string;
  formats?: string;
}

export interface DiscogsTrack {
  track_id: string;
  release_id?: string; // Discogs release ID for linking to albums
  title: string;
  artist: string;
  album: string;
  year: number | null;
  styles: string[];
  genres: string[];
  duration: string;
  discogs_url: string;
  album_thumbnail: string;
  position: string;
  duration_seconds: number | null;
  bpm: number | null;
  key: string | null;
  notes: string | null;
  local_tags: string | null;
  apple_music_url: string | null;
  local_audio_url: string | null;
  username: string;
  date_added?: string | null; // When user added to Discogs collection
  friend_id?: number; // resolved via friends table during upsert/index
}

export interface ProcessedTrack {
  position: string;
  title: string;
  duration: string;
  artists: DiscogsSimpleArtist[];
  duration_seconds?: number | null;
  apple_music_url?: string | null;
  youtube_url?: string | null;
  soundcloud_url?: string | null;
  local_audio_url?: string | null;
}

export type Album = Omit<
  AlbumEntity,
  "track_count" | "year" | "audio_file_album_art_url" | "discogs_url"
> & {
  track_count: number;
  year?: string | null;
  audio_file_album_art_url?: string;
  discogs_url?: string;
};
