import { describe, it, expect } from "vitest";
import { resolveTrackMenuState, type TrackAudioActions } from "@/components/trackActionsMenuState";

const noop = () => {};

const baseAudioActions: TrackAudioActions = {
  onFetchAudio: noop,
  onUploadFile: noop,
  onRemoveAudio: noop,
};

describe("resolveTrackMenuState", () => {
  it("streaming links, no local audio (card/view default)", () => {
    const state = resolveTrackMenuState({
      apple_music_url: "https://music.apple.com/x",
      youtube_url: undefined,
      soundcloud_url: undefined,
      local_audio_url: undefined,
    });

    expect(state.hasAudio).toBe(false);
    expect(state.hasStreamingLinks).toBe(true);
    expect(state.showPlay).toBe(false);
    expect(state.showEdit).toBe(true);
    expect(state.showFetchAudio).toBe(true);
    expect(state.showRemoveAudio).toBe(false);
    expect(state.showTrackDebug).toBe(false);
    expect(state.usingAudioOverride).toBe(false);
  });

  it("allows re-fetch when local audio already exists", () => {
    const state = resolveTrackMenuState({
      youtube_url: "https://youtu.be/x",
      local_audio_url: "audio_123.m4a",
    });

    expect(state.hasAudio).toBe(true);
    expect(state.showPlay).toBe(true);
    expect(state.showRemoveAudio).toBe(true);
    // fetch still offered so audio can be replaced
    expect(state.showFetchAudio).toBe(true);
  });

  it("hides fetch when there are no streaming links", () => {
    const state = resolveTrackMenuState({
      local_audio_url: "audio_123.m4a",
    });

    expect(state.hasStreamingLinks).toBe(false);
    expect(state.showFetchAudio).toBe(false);
    // upload/remove still available for a local-audio-only track
    expect(state.showRemoveAudio).toBe(true);
  });

  it("hides Edit when hideEdit is set (edit page)", () => {
    const state = resolveTrackMenuState(
      { soundcloud_url: "https://soundcloud.com/x" },
      { hideEdit: true },
    );
    expect(state.showEdit).toBe(false);
  });

  it("shows Track Debug when hasTrackDebug is set", () => {
    const state = resolveTrackMenuState({}, { hasTrackDebug: true });
    expect(state.showTrackDebug).toBe(true);
  });

  it("uses default loading flags when no override is provided", () => {
    const state = resolveTrackMenuState(
      { youtube_url: "https://youtu.be/x", local_audio_url: "a.m4a" },
      {
        defaultFetchLoading: true,
        defaultUploadLoading: true,
        defaultRemoveLoading: true,
      },
    );
    expect(state.usingAudioOverride).toBe(false);
    expect(state.fetchAudioLoading).toBe(true);
    expect(state.uploadLoading).toBe(true);
    expect(state.removeAudioLoading).toBe(true);
    // fetch is enabled by default (no override disabling it)
    expect(state.fetchAudioDisabled).toBe(false);
  });

  it("override flags win over defaults", () => {
    const state = resolveTrackMenuState(
      { youtube_url: "https://youtu.be/x", local_audio_url: "a.m4a" },
      {
        audioActions: {
          ...baseAudioActions,
          fetchAudioLoading: false,
          fetchAudioDisabled: true,
          uploadLoading: true,
          removeAudioLoading: false,
        },
        // defaults should be ignored once an override is present
        defaultFetchLoading: true,
        defaultUploadLoading: false,
        defaultRemoveLoading: true,
      },
    );
    expect(state.usingAudioOverride).toBe(true);
    expect(state.fetchAudioLoading).toBe(false);
    expect(state.fetchAudioDisabled).toBe(true);
    expect(state.uploadLoading).toBe(true);
    expect(state.removeAudioLoading).toBe(false);
  });

  it("override with omitted flags falls back to false (not to defaults)", () => {
    const state = resolveTrackMenuState(
      { youtube_url: "https://youtu.be/x" },
      {
        audioActions: baseAudioActions,
        defaultFetchLoading: true,
        defaultUploadLoading: true,
        defaultRemoveLoading: true,
      },
    );
    expect(state.usingAudioOverride).toBe(true);
    expect(state.fetchAudioLoading).toBe(false);
    expect(state.uploadLoading).toBe(false);
    expect(state.removeAudioLoading).toBe(false);
    expect(state.fetchAudioDisabled).toBe(false);
  });
});
