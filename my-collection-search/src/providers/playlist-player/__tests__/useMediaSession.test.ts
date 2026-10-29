// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaSession } from "@/providers/playlist-player/useMediaSession";
import type { MediaSessionLike } from "@/providers/playlist-player/useMediaSession";
import type { Track } from "@/types/track";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: "t1",
    id: 1,
    title: "Test Track",
    artist: "Test Artist",
    album: "Test Album",
    year: "2020",
    duration: "3:00",
    duration_seconds: 180,
    position: "A1",
    discogs_url: null,
    apple_music_url: "https://music.apple.com/test",
    youtube_url: null,
    soundcloud_url: null,
    album_thumbnail: "https://img/thumb.jpg",
    local_tags: "",
    bpm: null,
    key: null,
    notes: "",
    star_rating: 0,
    friend_id: 1,
    username: "alice",
    ...overrides,
  } as Track;
}

function makeMediaSession(): MediaSessionLike & { handlers: Record<string, unknown> } {
  const handlers: Record<string, unknown> = {};
  return {
    metadata: null,
    playbackState: undefined,
    handlers,
    setActionHandler: vi.fn((action, handler) => {
      handlers[action] = handler;
    }),
    setPositionState: vi.fn(),
  };
}

function makeArgs(overrides: Partial<Parameters<typeof useMediaSession>[0]> = {}) {
  const mediaSession = makeMediaSession();
  return {
    enabled: true,
    getMediaSession: vi.fn(() => mediaSession),
    currentTrack: makeTrack(),
    isPlaying: false,
    currentTime: 0,
    duration: 200,
    audioRef: { current: { currentTime: 5 } as HTMLAudioElement },
    play: vi.fn(),
    pause: vi.fn(),
    playPrev: vi.fn(),
    playNext: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    _mediaSession: mediaSession,
    ...overrides,
  };
}

// ─── enabled guard ────────────────────────────────────────────────────────────

describe("enabled guard", () => {
  it("does not call getMediaSession when disabled", () => {
    const args = makeArgs({ enabled: false });

    renderHook(() => useMediaSession(args));

    expect(args.getMediaSession).not.toHaveBeenCalled();
  });

  it("does not set playbackState when disabled", () => {
    const mediaSession = makeMediaSession();
    const args = makeArgs({
      enabled: false,
      getMediaSession: vi.fn(() => mediaSession),
    });

    renderHook(() => useMediaSession(args));

    expect(mediaSession.playbackState).toBeUndefined();
  });
});

// ─── metadata ─────────────────────────────────────────────────────────────────

describe("metadata", () => {
  it("sets metadata with track info and artwork when track has thumbnail", () => {
    const MediaMetadataMock = vi.fn((init) => ({ ...init }));
    (window as unknown as Record<string, unknown>).MediaMetadata = MediaMetadataMock;

    const args = makeArgs({ currentTrack: makeTrack({ album_thumbnail: "https://img/art.jpg" }) });
    renderHook(() => useMediaSession(args));

    expect(MediaMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Test Track",
        artist: "Test Artist",
        album: "Test Album",
        artwork: expect.arrayContaining([expect.objectContaining({ src: "https://img/art.jpg" })]),
      }),
    );
  });

  it("sets metadata without artwork when track has no thumbnail", () => {
    const MediaMetadataMock = vi.fn((init) => ({ ...init }));
    (window as unknown as Record<string, unknown>).MediaMetadata = MediaMetadataMock;

    const args = makeArgs({ currentTrack: makeTrack({ album_thumbnail: undefined }) });
    renderHook(() => useMediaSession(args));

    const call = MediaMetadataMock.mock.calls[0]?.[0];
    expect(call?.artwork).toBeUndefined();
  });

  it("sets metadata to null when currentTrack is null", () => {
    const args = makeArgs({ currentTrack: null });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.metadata).toBeNull();
  });
});

// ─── action handlers ──────────────────────────────────────────────────────────

describe("action handlers", () => {
  it("registers play, pause, previoustrack, nexttrack, stop handlers", () => {
    const args = makeArgs();
    renderHook(() => useMediaSession(args));

    const session = args._mediaSession;
    expect(session.setActionHandler).toHaveBeenCalledWith("play", args.play);
    expect(session.setActionHandler).toHaveBeenCalledWith("pause", args.pause);
    expect(session.setActionHandler).toHaveBeenCalledWith("previoustrack", args.playPrev);
    expect(session.setActionHandler).toHaveBeenCalledWith("nexttrack", args.playNext);
    expect(session.setActionHandler).toHaveBeenCalledWith("stop", args.stop);
  });

  it("seekbackward uses default offset of 10 when seekOffset is not provided", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekback = handlers["seekbackward"] as (d?: { seekOffset?: number }) => void;
    seekback();

    // audioRef.current.currentTime = 5, offset = 10 → 5 - 10 = -5
    expect(args.seek).toHaveBeenCalledWith(-5);
  });

  it("seekbackward uses the provided seekOffset", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekback = handlers["seekbackward"] as (d?: { seekOffset?: number }) => void;
    seekback({ seekOffset: 3 });

    expect(args.seek).toHaveBeenCalledWith(2); // 5 - 3
  });

  it("seekforward uses default offset of 10 when seekOffset is not provided", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekfwd = handlers["seekforward"] as (d?: { seekOffset?: number }) => void;
    seekfwd();

    expect(args.seek).toHaveBeenCalledWith(15); // 5 + 10
  });

  it("seekforward uses the provided seekOffset", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekfwd = handlers["seekforward"] as (d?: { seekOffset?: number }) => void;
    seekfwd({ seekOffset: 20 });

    expect(args.seek).toHaveBeenCalledWith(25); // 5 + 20
  });

  it("seekto calls seek with the provided seekTime", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekto = handlers["seekto"] as (d?: { seekTime?: number }) => void;
    seekto({ seekTime: 42 });

    expect(args.seek).toHaveBeenCalledWith(42);
  });

  it("seekto does not call seek when seekTime is not a number", () => {
    const args = makeArgs();
    const { handlers } = args._mediaSession;
    renderHook(() => useMediaSession(args));

    const seekto = handlers["seekto"] as (d?: { seekTime?: number }) => void;
    seekto({});

    expect(args.seek).not.toHaveBeenCalled();
  });

  it("clears all action handlers on unmount", () => {
    const args = makeArgs();
    const session = args._mediaSession;
    const { unmount } = renderHook(() => useMediaSession(args));

    unmount();

    expect(session.setActionHandler).toHaveBeenCalledWith("play", null);
    expect(session.setActionHandler).toHaveBeenCalledWith("pause", null);
    expect(session.setActionHandler).toHaveBeenCalledWith("seekbackward", null);
  });
});

// ─── playbackState ────────────────────────────────────────────────────────────

describe("playbackState", () => {
  it("sets playbackState to 'playing' when isPlaying is true", () => {
    const args = makeArgs({ isPlaying: true });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.playbackState).toBe("playing");
  });

  it("sets playbackState to 'paused' when isPlaying is false", () => {
    const args = makeArgs({ isPlaying: false });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.playbackState).toBe("paused");
  });
});

// ─── position state ───────────────────────────────────────────────────────────

describe("position state", () => {
  it("calls setPositionState when duration is finite and positive", () => {
    const args = makeArgs({ duration: 200, currentTime: 45 });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.setPositionState).toHaveBeenCalledWith({
      duration: 200,
      playbackRate: 1.0,
      position: 45,
    });
  });

  it("does not call setPositionState when duration is 0", () => {
    const args = makeArgs({ duration: 0, currentTime: 0 });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.setPositionState).not.toHaveBeenCalled();
  });

  it("does not call setPositionState when duration is not finite", () => {
    const args = makeArgs({ duration: Infinity });
    const session = args._mediaSession;

    renderHook(() => useMediaSession(args));

    expect(session.setPositionState).not.toHaveBeenCalled();
  });
});
