// The single catalogue of analytics events: every event the app sends, and
// the properties each one carries. `analytics.track` only accepts names and
// shapes declared here, so this file is also the record of what is collected.

type ServerSource = { source: "api" };

export type AnalyticsEvents = {
  // ── Client ────────────────────────────────────────────────────────────────
  playlist_imported: {
    playlist_name: string;
    track_count: number;
    import_format: "json";
  };
  playback_started: {
    playlist_id: number;
    playlist_name: string;
    track_count: number;
    source: "playlist_manager";
  };
  search_query_executed: {
    query_length: number;
    has_filters: boolean;
    filter_count: number;
  };
  audio_fetch_queued: {
    track_id: string;
    has_apple_music: boolean;
    has_youtube: boolean;
    has_soundcloud: boolean;
  };
  track_added_to_playlist: {
    track_id: string;
    playlist_id?: number;
    playlist_name: string;
    is_new_playlist: boolean;
  };
  playlist_exported: {
    playlist_id: number | undefined;
    track_count: number;
    export_format: "json" | "pdf";
  };
  playlist_sorted: {
    playlist_id: number | undefined;
    track_count: number;
    sort_algorithm: "greedy" | "genetic" | "cohesive_blocks";
  };

  // ── Server ────────────────────────────────────────────────────────────────
  playlist_created: ServerSource & {
    playlist_id: number;
    playlist_name: string;
    track_count: number;
  };
  playlist_deleted: ServerSource & {
    playlist_id: number;
    playlist_name: string | undefined;
  };
  track_edited: ServerSource & {
    track_id: string;
    changed_fields: string[];
    has_rating_change: boolean;
    has_notes_change: boolean;
    has_tags_change: boolean;
  };
  friend_added: ServerSource & { friend_username: string };
  friend_removed: ServerSource & { friend_username: string };
  album_download_queued: ServerSource & {
    release_id: string;
    friend_id: number;
    track_count: number;
  };
  discogs_sync_started: ServerSource & {
    username: string;
    manifest_ids_count: number;
  };
};

export type AnalyticsEventName = keyof AnalyticsEvents;
