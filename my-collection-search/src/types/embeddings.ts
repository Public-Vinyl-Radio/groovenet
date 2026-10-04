import type { Track } from "@/types/track";

export type SimilarTrackBase = Pick<
  Track,
  | "track_id"
  | "friend_id"
  | "title"
  | "artist"
  | "album"
  | "year"
  | "genres"
  | "styles"
  | "local_tags"
  | "album_thumbnail"
  | "audio_file_album_art_url"
  | "bpm"
  | "key"
  | "star_rating"
  | "duration_seconds"
  | "position"
  | "discogs_url"
  | "apple_music_url"
    | "youtube_url"
  | "local_audio_url"
>;

export type SimilarIdentityTrack = SimilarTrackBase & {
  distance: number;
  identity_text: string;
};

export type SimilarVibeTrack = SimilarIdentityTrack &
  Pick<
    Track,
    "danceability" | "mood_happy" | "mood_sad" | "mood_relaxed" | "mood_aggressive"
  >;

export type SimilarityFilters = {
  era?: string;
  country?: string;
  tags?: string[];
};

export type EmbeddingTrackRef = Pick<Track, "track_id" | "friend_id">;

/** The two embedding kinds that support multiple models side by side (#386). */
export type EmbeddingModelKind = "identity" | "audio_vibe";

export type EmbeddingModelSettings = {
  embedding_type: EmbeddingModelKind;
  target_model: string;
  target_dims: number;
  serving_model: string;
  serving_dims: number;
  /** Template version reads filter to; the target is the code's constant (#407). */
  serving_template_version: number;
};
