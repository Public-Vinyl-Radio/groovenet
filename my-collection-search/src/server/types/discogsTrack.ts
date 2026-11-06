/**
 * A track row as the Discogs sync builds it from a release export, before it is
 * upserted into Postgres. Server-internal: no HTTP route exposes it (the only
 * Discogs shape on the wire is the release-lookup response, which lives in
 * `@groovenet/contracts`), so it is not a shared contract.
 */
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
