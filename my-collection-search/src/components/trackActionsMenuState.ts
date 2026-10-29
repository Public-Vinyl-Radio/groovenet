import type { Track } from "@/types/track";

/**
 * Optional overrides for the audio actions. Provided by the edit form so those
 * actions stage into the form (and avoid clobbering unsaved edits) instead of
 * hitting the server directly. When omitted, the menu uses built-in handlers
 * that persist immediately and refresh the store/query cache.
 */
export type TrackAudioActions = {
  onFetchAudio: () => void | Promise<void>;
  fetchAudioLoading?: boolean;
  fetchAudioDisabled?: boolean;
  onUploadFile: (file: File) => void | Promise<void>;
  uploadLoading?: boolean;
  onRemoveAudio: () => void | Promise<void>;
  removeAudioLoading?: boolean;
};

type TrackMenuTrackFields = Partial<
  Pick<Track, "local_audio_url" | "apple_music_url" | "youtube_url" | "soundcloud_url">
>;

export type TrackMenuStateOptions = {
  hideEdit?: boolean;
  hasTrackDebug?: boolean;
  audioActions?: TrackAudioActions;
  defaultFetchLoading?: boolean;
  defaultUploadLoading?: boolean;
  defaultRemoveLoading?: boolean;
};

export type TrackMenuState = {
  hasAudio: boolean;
  hasStreamingLinks: boolean;
  showPlay: boolean;
  showEdit: boolean;
  showTrackDebug: boolean;
  showFetchAudio: boolean;
  showRemoveAudio: boolean;
  /** True when the caller supplied form-aware audio handlers. */
  usingAudioOverride: boolean;
  fetchAudioLoading: boolean;
  fetchAudioDisabled: boolean;
  uploadLoading: boolean;
  removeAudioLoading: boolean;
};

/**
 * Pure resolver for what the track actions menu should show and which loading
 * flags apply. Kept free of React/DOM so it can be unit tested directly.
 *
 * Override flags win over the built-in defaults; when no override is provided,
 * the default loading flags are used and fetch is enabled by default.
 */
export function resolveTrackMenuState(
  track: TrackMenuTrackFields,
  opts: TrackMenuStateOptions = {},
): TrackMenuState {
  const { hideEdit, hasTrackDebug, audioActions } = opts;

  const hasAudio = Boolean(track.local_audio_url);
  const hasStreamingLinks = Boolean(
    track.apple_music_url || track.youtube_url || track.soundcloud_url,
  );

  // In override mode the loading flags come solely from the override (the
  // component's internal default-handler state is irrelevant); otherwise they
  // come from the defaults. Either source defaults to false when omitted.
  const usingAudioOverride = Boolean(audioActions);
  const fetchAudioLoading = usingAudioOverride
    ? (audioActions?.fetchAudioLoading ?? false)
    : (opts.defaultFetchLoading ?? false);
  const uploadLoading = usingAudioOverride
    ? (audioActions?.uploadLoading ?? false)
    : (opts.defaultUploadLoading ?? false);
  const removeAudioLoading = usingAudioOverride
    ? (audioActions?.removeAudioLoading ?? false)
    : (opts.defaultRemoveLoading ?? false);

  return {
    hasAudio,
    hasStreamingLinks,
    showPlay: hasAudio,
    showEdit: !hideEdit,
    showTrackDebug: Boolean(hasTrackDebug),
    // Fetch is offered whenever a streaming link exists — even when audio is
    // already present, so it can be re-fetched.
    showFetchAudio: hasStreamingLinks,
    showRemoveAudio: hasAudio,
    usingAudioOverride,
    fetchAudioLoading,
    fetchAudioDisabled: audioActions?.fetchAudioDisabled ?? false,
    uploadLoading,
    removeAudioLoading,
  };
}
