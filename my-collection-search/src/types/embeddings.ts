import type { Track } from "@/types/track";
import type { TrackMissingFilter } from "@/lib/trackFilterSpec";

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

/**
 * Structured filters for context retrieval (#408), applied in SQL alongside
 * the vector scan. `era` is a `yearToEra` bucket (`1970s`, `pre-1950s`,
 * `unknown-era`); `genre` matches any album (else track) genre or style,
 * case-insensitively.
 */
export type ContextRetrievalFilters = {
  friendId?: number;
  era?: string;
  genre?: string;
  bpmMin?: number;
  bpmMax?: number;
  /** The search route's "missing X" filter chips (#409). */
  missing?: TrackMissingFilter[];
};

export type ContextMatch = Pick<
  Track,
  | "track_id"
  | "friend_id"
  | "title"
  | "artist"
  | "album"
  | "year"
  | "genres"
  | "styles"
  | "bpm"
  | "key"
  | "album_thumbnail"
> & {
  release_id: string | null;
  distance: number;
  context_text: string;
};

/**
 * Every embedding kind with model settings (#386): `identity` for similar
 * tracks, `audio_vibe` for audio similarity, `context` for natural-language
 * retrieval (#408).
 */
export type EmbeddingModelKind = "identity" | "audio_vibe" | "context";

export type EmbeddingModelSettings = {
  embedding_type: EmbeddingModelKind;
  target_model: string;
  target_dims: number;
  serving_model: string;
  serving_dims: number;
  /** Template version reads filter to; the target is the code's constant (#407). */
  serving_template_version: number;
};
