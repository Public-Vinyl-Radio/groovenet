// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAirPlay } from "@/providers/playlist-player/useAirPlay";

type WebKitAudio = HTMLAudioElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
  disableRemotePlayback?: boolean;
};

function makeAudio(overrides: Partial<WebKitAudio> = {}): WebKitAudio {
  const el = {
    volume: 1,
    disableRemotePlayback: true,
    webkitCurrentPlaybackTargetIsWireless: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setAttribute: vi.fn(),
    ...overrides,
  } as unknown as WebKitAudio;
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe("initial state", () => {
  it("isAirPlayAvailable is false when webkitShowPlaybackTargetPicker is not a function", () => {
    const audio = makeAudio({ webkitShowPlaybackTargetPicker: undefined });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(result.current.isAirPlayAvailable).toBe(false);
  });

  it("isAirPlayAvailable is true when webkitShowPlaybackTargetPicker is present", () => {
    const audio = makeAudio({ webkitShowPlaybackTargetPicker: vi.fn() });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(result.current.isAirPlayAvailable).toBe(true);
  });

  it("isAirPlayActive reflects webkitCurrentPlaybackTargetIsWireless", () => {
    const audio = makeAudio({
      webkitShowPlaybackTargetPicker: vi.fn(),
      webkitCurrentPlaybackTargetIsWireless: true,
    });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(result.current.isAirPlayActive).toBe(true);
  });

  it("sets disableRemotePlayback to false on the audio element", () => {
    const audio = makeAudio({ disableRemotePlayback: true });
    renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(audio.disableRemotePlayback).toBe(false);
  });

  it("sets airplay attributes on the audio element", () => {
    const audio = makeAudio();
    renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(audio.setAttribute).toHaveBeenCalledWith("x-webkit-airplay", "allow");
    expect(audio.setAttribute).toHaveBeenCalledWith("airplay", "allow");
  });

  it("does nothing when audioRef.current is null", () => {
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: null }, plVersion: 0 }));

    expect(result.current.isAirPlayAvailable).toBe(false);
    expect(result.current.isAirPlayActive).toBe(false);
  });

  it("registers webkitplaybacktargetavailabilitychanged event listener", () => {
    const audio = makeAudio();
    renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(audio.addEventListener).toHaveBeenCalledWith(
      "webkitplaybacktargetavailabilitychanged",
      expect.any(Function),
    );
  });

  it("registers webkitcurrentplaybacktargetiswirelesschanged event listener", () => {
    const audio = makeAudio();
    renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(audio.addEventListener).toHaveBeenCalledWith(
      "webkitcurrentplaybacktargetiswirelesschanged",
      expect.any(Function),
    );
  });

  it("removes both event listeners on unmount", () => {
    const audio = makeAudio();
    const { unmount } = renderHook(() =>
      useAirPlay({ audioRef: { current: audio }, plVersion: 0 }),
    );

    unmount();

    expect(audio.removeEventListener).toHaveBeenCalledWith(
      "webkitplaybacktargetavailabilitychanged",
      expect.any(Function),
    );
    expect(audio.removeEventListener).toHaveBeenCalledWith(
      "webkitcurrentplaybacktargetiswirelesschanged",
      expect.any(Function),
    );
  });
});

// ─── availability change event ────────────────────────────────────────────────

describe("webkitplaybacktargetavailabilitychanged event", () => {
  function makeRealAudio(extra: Partial<WebKitAudio> = {}): WebKitAudio {
    // Use a real DOM element so dispatchEvent integrates with React's batching.
    const el = document.createElement("audio") as unknown as WebKitAudio;
    Object.assign(el, {
      disableRemotePlayback: false,
      webkitCurrentPlaybackTargetIsWireless: false,
      ...extra,
    });
    return el;
  }

  it("sets isAirPlayAvailable to true when availability is 'available'", () => {
    const audio = makeRealAudio();
    const audioRef = { current: audio };
    const { result } = renderHook(() => useAirPlay({ audioRef, plVersion: 0 }));

    act(() => {
      audio.dispatchEvent(
        Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), {
          availability: "available",
        }),
      );
    });

    expect(result.current.isAirPlayAvailable).toBe(true);
  });

  it("sets isAirPlayAvailable to false when availability is 'not-available'", () => {
    const audio = makeRealAudio({ webkitShowPlaybackTargetPicker: vi.fn() });
    const audioRef = { current: audio };
    const { result } = renderHook(() => useAirPlay({ audioRef, plVersion: 0 }));

    expect(result.current.isAirPlayAvailable).toBe(true); // starts true (hasPicker)

    act(() => {
      audio.dispatchEvent(
        Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), {
          availability: "not-available",
        }),
      );
    });

    expect(result.current.isAirPlayAvailable).toBe(false);
  });

  it("falls back to hasPicker when availability is unknown", () => {
    const audio = makeRealAudio({ webkitShowPlaybackTargetPicker: vi.fn() });
    const audioRef = { current: audio };
    const { result } = renderHook(() => useAirPlay({ audioRef, plVersion: 0 }));

    act(() => {
      audio.dispatchEvent(
        Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), {
          availability: "unknown",
        }),
      );
    });

    expect(result.current.isAirPlayAvailable).toBe(true); // hasPicker = true
  });
});

// ─── showAirPlayPicker ────────────────────────────────────────────────────────

describe("showAirPlayPicker()", () => {
  it("calls webkitShowPlaybackTargetPicker and returns true", () => {
    const picker = vi.fn();
    const audio = makeAudio({ webkitShowPlaybackTargetPicker: picker });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    const returned = result.current.showAirPlayPicker();

    expect(picker).toHaveBeenCalled();
    expect(returned).toBe(true);
  });

  it("returns false when audioRef.current is null", () => {
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: null }, plVersion: 0 }));

    expect(result.current.showAirPlayPicker()).toBe(false);
  });

  it("returns false when webkitShowPlaybackTargetPicker is not a function", () => {
    const audio = makeAudio({ webkitShowPlaybackTargetPicker: undefined });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(result.current.showAirPlayPicker()).toBe(false);
  });

  it("returns false when webkitShowPlaybackTargetPicker throws", () => {
    const picker = vi.fn(() => {
      throw new Error("Not supported");
    });
    const audio = makeAudio({ webkitShowPlaybackTargetPicker: picker });
    const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

    expect(result.current.showAirPlayPicker()).toBe(false);
  });
});
