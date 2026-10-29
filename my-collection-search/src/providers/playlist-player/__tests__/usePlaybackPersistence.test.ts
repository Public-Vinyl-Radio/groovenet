// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, useCallback, useRef, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { usePlaybackPersistence } from "@/providers/playlist-player/usePlaybackPersistence";
import type { Track } from "@/types/track";

const KEY = "test-playback-state";

// Vitest's jsdom environment can inherit Node's experimental localStorage,
// which is undefined unless Node receives --localstorage-file. Use a tiny
// deterministic Storage implementation for this hook suite instead.
const storage = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, String(value)),
  } satisfies Storage,
});

function makeTrack(id: string): Track {
  return {
    track_id: id,
    id: 1,
    title: `T${id}`,
    artist: "A",
    album: "B",
    year: "2020",
    duration: "3:00",
    duration_seconds: 180,
    position: "A1",
    discogs_url: "",
    apple_music_url: "",
    local_tags: "",
    bpm: null,
    key: null,
    notes: "",
    star_rating: 0,
    friend_id: 1,
    username: "alice",
  } as Track;
}

function makeArgs(overrides: Partial<Parameters<typeof usePlaybackPersistence>[0]> = {}) {
  return {
    storageKey: KEY,
    playlist: [],
    playlistRef: { current: [] },
    currentTrackIndex: null,
    isPlaying: false,
    volume: 0.8,
    currentTime: 0,
    plVersion: 0,
    pendingSeekRef: { current: null },
    audioRef: { current: null },
    setPlaylist: vi.fn(),
    setPlVersion: vi.fn(),
    setCurrentTrackIndex: vi.fn(),
    setIsPlaying: vi.fn(),
    setVolumeState: vi.fn(),
    ...overrides,
  } as Parameters<typeof usePlaybackPersistence>[0];
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

// ─── restore from localStorage on mount ──────────────────────────────────────

describe("restore on mount", () => {
  it("restores playlist when localStorage contains a valid playlist array", () => {
    const saved = [makeTrack("a"), makeTrack("b")];
    window.localStorage.setItem(KEY, JSON.stringify({ playlist: saved }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setPlaylist).toHaveBeenCalledWith(saved);
    expect(args.playlistRef.current).toEqual(saved);
    expect(args.setPlVersion).toHaveBeenCalled();
  });

  it("restores currentTrackIndex when present as a number", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ currentTrackIndex: 2 }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setCurrentTrackIndex).toHaveBeenCalledWith(2);
  });

  it("restores currentTrackIndex when present as null", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ currentTrackIndex: null }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setCurrentTrackIndex).toHaveBeenCalledWith(null);
  });

  it("restores isPlaying when present as a boolean", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ isPlaying: true }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setIsPlaying).toHaveBeenCalledWith(true);
  });

  it("restores volume clamped to [0, 1]", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ volume: 1.5 }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setVolumeState).toHaveBeenCalledWith(1);
  });

  it("clamps volume below 0 to 0", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ volume: -0.5 }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setVolumeState).toHaveBeenCalledWith(0);
  });

  it("sets audio element volume when audioRef.current exists", () => {
    const audio = { volume: 0 } as HTMLAudioElement;
    window.localStorage.setItem(KEY, JSON.stringify({ volume: 0.6 }));

    const args = makeArgs({ audioRef: { current: audio } });
    renderHook(() => usePlaybackPersistence(args));

    expect(audio.volume).toBe(0.6);
  });

  it("sets pendingSeekRef when currentTime is a number", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ currentTime: 42 }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.pendingSeekRef.current).toBe(42);
  });

  it("does nothing when localStorage has no entry for the key", () => {
    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setPlaylist).not.toHaveBeenCalled();
    expect(args.setCurrentTrackIndex).not.toHaveBeenCalled();
  });

  it("ignores corrupt JSON without throwing", () => {
    window.localStorage.setItem(KEY, "not-valid-json{{{");

    const args = makeArgs();
    expect(() => renderHook(() => usePlaybackPersistence(args))).not.toThrow();
  });

  it("ignores playlist when it is not an array", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ playlist: "oops" }));

    const args = makeArgs();
    renderHook(() => usePlaybackPersistence(args));

    expect(args.setPlaylist).not.toHaveBeenCalled();
  });
});

// ─── persist on state change ──────────────────────────────────────────────────

describe("persist on state change", () => {
  it("writes state to localStorage when dependencies change", () => {
    const playlist = [makeTrack("a")];
    const args = makeArgs({
      playlist,
      currentTrackIndex: 0,
      isPlaying: true,
      volume: 0.5,
      currentTime: 10,
    });

    renderHook(() => usePlaybackPersistence(args));

    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved.playlist).toEqual(playlist);
    expect(saved.currentTrackIndex).toBe(0);
    expect(saved.isPlaying).toBe(true);
    expect(saved.volume).toBe(0.5);
  });

  it("writes currentTime using the override when provided via time-based effect", () => {
    // The time-based effect fires when currentTime changes to a new integer second.
    const args = makeArgs({ currentTime: 5 });
    renderHook(() => usePlaybackPersistence(args));

    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved.currentTime).toBe(5);
  });
});

// ─── restore-then-persist ordering (#592) ────────────────────────────────────

// The provider's real wiring: state lives in React, so a restore only takes
// effect on the next render. The mocked-setter suites above cannot see the
// race between the restore effect and the persist effects.
function useWiredPersistence() {
  const [playlist, setPlaylistState] = useState<Track[]>([]);
  const playlistRef = useRef<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [plVersion, setPlVersion] = useState(0);
  const pendingSeekRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setPlaylist = useCallback((next: Track[]) => setPlaylistState(next), []);

  usePlaybackPersistence({
    storageKey: KEY,
    playlist,
    playlistRef,
    currentTrackIndex,
    isPlaying,
    volume,
    currentTime: 0,
    plVersion,
    pendingSeekRef,
    audioRef,
    setPlaylist,
    setPlVersion,
    setCurrentTrackIndex,
    setIsPlaying,
    setVolumeState,
  });
  return { playlist, currentTrackIndex, volume, setPlaylist, setCurrentTrackIndex };
}

function stored() {
  return JSON.parse(window.localStorage.getItem(KEY)!);
}

describe("restore then persist", () => {
  const seed = {
    playlist: [makeTrack("a"), makeTrack("b")],
    currentTrackIndex: 1,
    isPlaying: false,
    volume: 0.3,
    currentTime: 0,
  };

  it.each([
    ["without StrictMode", undefined],
    ["under StrictMode", StrictMode],
  ])("restores the stored queue and keeps it stored %s", (_label, wrapper) => {
    window.localStorage.setItem(KEY, JSON.stringify(seed));

    const { result } = renderHook(() => useWiredPersistence(), { wrapper });

    expect(result.current.playlist).toEqual(seed.playlist);
    expect(result.current.currentTrackIndex).toBe(1);
    expect(result.current.volume).toBe(0.3);
    expect(stored()).toMatchObject({ playlist: seed.playlist, currentTrackIndex: 1 });
  });

  it("never writes the empty initial queue over a stored one", () => {
    window.localStorage.setItem(KEY, JSON.stringify(seed));
    const writes: number[] = [];
    const setItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k: string, v: string) => {
      writes.push(JSON.parse(v).playlist.length);
      setItem(k, v);
    };

    renderHook(() => useWiredPersistence(), { wrapper: StrictMode });

    window.localStorage.setItem = setItem;
    expect(writes.length).toBeGreaterThan(0);
    expect(writes).not.toContain(0);
  });

  it.each([
    ["missing", null],
    ["corrupt", "not-valid-json{{{"],
  ])("starts persisting after a %s stored value", (_label, raw) => {
    if (raw !== null) window.localStorage.setItem(KEY, raw);

    renderHook(() => useWiredPersistence(), { wrapper: StrictMode });

    expect(stored()).toMatchObject({ playlist: [], currentTrackIndex: null });
  });

  it("persists later changes after the restore", () => {
    window.localStorage.setItem(KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useWiredPersistence(), { wrapper: StrictMode });

    act(() => result.current.setCurrentTrackIndex(0));

    expect(stored().currentTrackIndex).toBe(0);
    expect(stored().playlist).toEqual(seed.playlist);
  });

  it("persists a deliberate clear instead of restoring the old queue", () => {
    window.localStorage.setItem(KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useWiredPersistence(), { wrapper: StrictMode });
    expect(result.current.playlist).toHaveLength(2);

    act(() => {
      result.current.setPlaylist([]);
      result.current.setCurrentTrackIndex(null);
    });

    expect(stored()).toMatchObject({ playlist: [], currentTrackIndex: null });
  });
});
