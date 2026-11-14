// The single catalogue of analytics events: every event the app sends, and
// the properties each one carries. `analytics.track` only accepts names and
// shapes declared here, so this file is also the record of what is collected.
//
// Privacy rule (#345): events carry IDs, counts, enums and durations — never
// free text or personal handles. No playlist names, usernames, notes, search
// queries or file names. To tell things apart, send the ID; the name stays in
// Postgres. Every new event follows this rule.

import type { CleaningMethod, RecordActionType, SleeveType } from "@/lib/recordCare";

/**
 * Where a server event came from. Set by the server entry point, never by the
 * caller: `web` is a request without an `X-Groovenet-Client` header (the
 * browser), `cli` and `mcp` are `@groovenet/client` callers that name
 * themselves, and `pipeline` is work the app does on its own behalf — a
 * background pass, or a worker (`X-Groovenet-Client: worker`) reporting back.
 */
export type EventSource = "web" | "cli" | "mcp" | "pipeline";

type ServerSource = { source: EventSource };

/** What was done with a track from its actions menu, for events that care. */
export type TrackMenuAction = "played" | "queued" | "added_to_playlist";

/** Where a suggestion list is drawn. */
export type SuggestionSurface = "track_page" | "suggestions_panel";

/** Which similarity list found a suggestion: metadata identity or audio vibe. */
export type SuggestionSource = "identity" | "audio";

export type AnalyticsEvents = {
  // ── Client ────────────────────────────────────────────────────────────────
  playlist_imported: {
    track_count: number;
    import_format: "json";
  };
  playback_started: {
    playlist_id: number;
    track_count: number;
    source: "playlist_manager";
  };
  search_query_executed: {
    query_length: number;
    has_filters: boolean;
    filter_count: number;
    search_mode?: "lexical" | "semantic" | "hybrid";
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
  // Suggestions (#1185). `suggestions_shown` is the denominator: one per list
  // load, and again when a filter changes the list (`trigger`). A whole-playlist
  // list in the panel has no single seed, so `seed_track_id` is null there.
  suggestions_shown: {
    surface: SuggestionSurface;
    seed_track_id: string | null;
    trigger: "load" | "filter_change";
    shown_count: number;
    scope: "library" | "all";
    compatible_key: boolean;
    bpm_within_6pct: boolean;
    hidden_by_filters: number;
  };
  // A suggestion put to use. `rank` is its 1-based place in the list;
  // `sources` are the similarity lists that found it, from its scores;
  // `from_fold` is a track shown by expanding a "+N more" group.
  recommendation_acted_on: {
    track_id: string;
    action: TrackMenuAction;
    rank: number;
    sources: SuggestionSource[];
    surface: SuggestionSurface;
    seed_track_id: string | null;
    from_fold: boolean;
    sim_identity: number | null;
    sim_audio: number | null;
    key_relation: "same" | "adjacent" | "clash" | "unknown";
  };
  // "Show more" (or the panel's scroll-to-load) and a fold opened; `depth` is
  // how many rows the list shows once it has expanded.
  suggestions_expanded: {
    surface: SuggestionSurface;
    seed_track_id: string | null;
    kind: "show_more" | "fold";
    depth: number;
  };
  // `completed: false` is a session left before its last track.
  enrich_session_started: {
    track_count: number;
    llm: boolean;
    apple_music: boolean;
    youtube: boolean;
    fetch_audio: boolean;
  };
  enrich_session_completed: {
    track_count: number;
    tracks_saved: number;
    tracks_skipped: number;
    completed: boolean;
  };
  command_palette_used: {
    scope:
      | "global"
      | "tracks"
      | "albums"
      | "artists"
      | "genres"
      | "playlists"
      | "track"
      | "album"
      | "playlist";
    command:
      | "navigate"
      | "play_pause"
      | "next_track"
      | "previous_track"
      | "clear_queue"
      | "create_playlist_from_queue"
      | "open_playlist"
      | "open_track"
      | "play_track"
      | "open_genre"
      | "open_artist"
      | "filter_tracks_by_artist"
      | "open_album"
      | "play_album"
      | "search_tracks_query"
      | "search_albums_query"
      | "scoped_search"
      | "add_track_to_playlist"
      | "optimise_playlist"
      | "queue_album"
      | "queue_track_next"
      | "queue_track"
      | "find_similar_vibe"
      | "open_from_header"
      | "open_action_sheet";
  };

  // ── Server ────────────────────────────────────────────────────────────────
  playlist_created: ServerSource & {
    playlist_id: number;
    track_count: number;
  };
  playlist_deleted: ServerSource & {
    playlist_id: number;
  };
  track_edited: ServerSource & {
    track_id: string;
    changed_fields: string[];
    has_rating_change: boolean;
    has_notes_change: boolean;
    has_tags_change: boolean;
  };
  friend_added: ServerSource;
  friend_removed: ServerSource;
  album_download_queued: ServerSource & {
    release_id: string;
    friend_id: number;
    track_count: number;
  };
  album_deleted: ServerSource & {
    release_id: string;
    friend_id: number;
    track_count: number;
  };
  // One per download job, reported by the worker when the job ends. Over
  // `album_download_queued` and `audio_fetch_queued`, the download success rate.
  track_download_completed: ServerSource & {
    track_id: string;
    downloader: "gamdl" | "yt-dlp";
    url_kind: "apple_music" | "youtube" | "soundcloud";
    duration_ms: number | null;
    analysis_ok: boolean;
  };
  track_download_failed: ServerSource & {
    track_id: string;
    duration_ms: number | null;
  };
  discogs_sync_started: ServerSource & {
    manifest_ids_count: number;
  };
  discogs_sync_completed: ServerSource & {
    new_releases: number;
    removed_releases: number;
    error_count: number;
    duration_ms: number;
  };

  // Spins. A detected spin that is later edited or deleted is a fingerprint
  // miss, so `spin_edited`/`spin_deleted` with `was_detected` over
  // `spin_auto_detected` is the listener's error rate.
  spin_edited: ServerSource & {
    spin_id: number;
    was_detected: boolean;
    changed_fields: string[];
  };
  spin_deleted: ServerSource & {
    spin_id: number;
    was_detected: boolean;
  };
  spin_auto_detected: ServerSource & {
    spin_id: number;
    confidence: number;
    windows: number;
  };

  // Record care (#262): physical copies and what was done to them. Labels and
  // notes stay in Postgres; the action type, sleeve and method are enums.
  record_copy_added: ServerSource & {
    copy_id: number;
    release_id: string;
    friend_id: number;
  };
  record_copy_edited: ServerSource & {
    copy_id: number;
    release_id: string;
    is_default: boolean;
    changed_fields: ("label" | "notes")[];
  };
  record_copy_removed: ServerSource & {
    copy_id: number;
    release_id: string;
  };
  record_action_logged: ServerSource & {
    action_id: number;
    copy_id: number;
    action_type: RecordActionType;
    sleeve_type: SleeveType | null;
    method: CleaningMethod | null;
  };
  record_action_voided: ServerSource & {
    action_id: number;
    copy_id: number;
    action_type: RecordActionType;
  };
  // Care stacks and batch logs (#941). stack_no is null for an ad-hoc log.
  record_care_stack_pulled: ServerSource & {
    session_id: number;
    stack_no: number | null;
    record_count: number;
    created: boolean;
  };
  record_care_stack_discarded: ServerSource & {
    session_id: number;
    stack_no: number | null;
  };
  record_care_session_logged: ServerSource & {
    session_id: number;
    stack_no: number | null;
    action_types: RecordActionType[];
    record_count: number;
    sleeve_type: SleeveType | null;
    method: CleaningMethod | null;
  };
  record_care_session_voided: ServerSource & {
    session_id: number;
    stack_no: number | null;
    action_count: number;
  };

  recommendations_requested: ServerSource & {
    mode: "identity" | "audio" | "combined";
    seed_count: number;
    result_count: number;
  };

  // Set derivation (#282).
  set_recording_uploaded: ServerSource & {
    duration_seconds: number | null;
    size_bytes: number;
  };
  set_derivation_started: ServerSource & {
    derivation_id: string;
    reused: boolean;
  };
  set_derivation_completed: ServerSource & {
    derivation_id: string;
    status: "processed" | "failed";
    window_count: number;
    matched_window_count: number;
    play_count: number;
    duration_seconds: number | null;
  };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Events sent from the server: the ones whose `source` is an `EventSource`. */
export type ServerEventName = {
  [E in AnalyticsEventName]: AnalyticsEvents[E] extends ServerSource ? E : never;
}[AnalyticsEventName];

type WithoutSource<E extends ServerEventName> = Omit<AnalyticsEvents[E], "source">;

/**
 * A server event's properties as a caller passes them: `source` is filled in.
 * An event with nothing else is `Record<string, never>` rather than `{}`,
 * which would accept any object and let a name slip through.
 */
export type ServerEventProperties<E extends ServerEventName> = keyof WithoutSource<E> extends never
  ? Record<string, never>
  : WithoutSource<E>;
