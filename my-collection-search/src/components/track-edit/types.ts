import type { TrackGenre } from "@/types/track";
import { genreSelectionChanged } from "@/lib/genres/options";

export interface TrackEditFormProps {
  track_id: string;
  isrc?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: string | number | null;
  duration?: string;
  discogs_url?: string;
  release_id?: string;
  local_tags?: string | undefined;
  /** The track's taxonomy genres as loaded or edited (#371). */
  track_genres?: TrackGenre[];
  /** PATCH input: replaces the track's genres. Sent only when they changed. */
  genres?: string[];
  /** PATCH input: who chose `genres`, recorded on the links it adds. */
  genre_source?: "manual" | "enrichment";
  /** Mood and description words, kept out of genres (#371). */
  descriptors?: string[];
  notes?: string | undefined | null;
  bpm?: number | null;
  /** Margin (0-1) between the first and second beat-histogram peaks behind `bpm` (#531). */
  bpm_confidence?: number | null;
  key?: string | undefined | null;
  /** Confidence (0-1) of the EDMA key estimate stored in `key` (#524). */
  key_confidence?: number | null;
  danceability?: number | null;
  apple_music_url?: string;
  youtube_url?: string;
  soundcloud_url?: string;
  star_rating?: number;
  duration_seconds?: number | null;
  friend_id: number;
  local_audio_url?: string | null;
}

export type TrackEditFormState = {
  track_id: string;
  album: string;
  title: string;
  artist: string;
  local_tags: string;
  track_genres: TrackGenre[];
  notes: string;
  bpm: string;
  bpm_confidence?: number | null;
  key: string;
  key_confidence?: number | null;
  danceability: string;
  apple_music_url: string;
  youtube_url: string;
  soundcloud_url: string;
  star_rating: number;
  duration_seconds?: number;
  friend_id?: number;
};

export type TrackForSearch = Pick<
  TrackEditFormProps,
  "track_id" | "year" | "duration" | "isrc" | "release_id" | "discogs_url"
> | null;

export function toTrackEditFormState(track: TrackEditFormProps | null): TrackEditFormState {
  return {
    track_id: track?.track_id || "",
    album: track?.album || "",
    title: track?.title || "",
    artist: track?.artist || "",
    local_tags: (track?.local_tags as string | undefined) || "",
    track_genres: track?.track_genres ?? [],
    notes: (track?.notes as string | undefined) || "",
    bpm: (track?.bpm as string | undefined) || "",
    key: (track?.key as string | undefined) || "",
    bpm_confidence: track?.bpm_confidence ?? null,
    key_confidence: track?.key_confidence ?? null,
    danceability: (track?.danceability as string | undefined) || "",
    apple_music_url: track?.apple_music_url || "",
    youtube_url: track?.youtube_url || "",
    soundcloud_url: track?.soundcloud_url || "",
    star_rating: typeof track?.star_rating === "number" ? track.star_rating : 0,
    duration_seconds: track?.duration_seconds || undefined,
    friend_id: track?.friend_id,
  };
}

/**
 * The `genres` PATCH field when the selection differs from what was loaded,
 * else nothing. Sending only changes means a save from a form that never saw
 * the track's genres (an older cached track, say) cannot wipe them.
 */
export function genreChanges(
  loaded: TrackGenre[] | undefined,
  edited: TrackGenre[],
): Pick<TrackEditFormProps, "genres"> {
  if (!genreSelectionChanged(loaded ?? [], edited)) return {};
  return { genres: edited.map((genre) => genre.id) };
}
