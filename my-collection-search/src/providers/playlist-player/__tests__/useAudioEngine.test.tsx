// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAudioEngine } from "../useAudioEngine";
import { sampleTrack } from "@/stories/fixtures/track";

beforeEach(() => vi.restoreAllMocks());

function setup(codec: string | null = "alac", playing = true) {
  const audio = document.createElement("audio");
  vi.spyOn(audio, "play").mockResolvedValue();
  vi.spyOn(audio, "pause").mockImplementation(() => {});
  vi.spyOn(audio, "load").mockImplementation(() => {});
  const onPlaybackError = vi.fn();
  const args = {
    audioRef: { current: audio as HTMLAudioElement | null },
    playlistRef: {
      current: [{ ...sampleTrack, audio_codec: codec, local_audio_url: "/audio/test.m4a" }],
    },
    currentTrackIndex: 0 as number | null,
    isPlaying: playing,
    plVersion: 0,
    volume: 0.5,
    onEnded: vi.fn(),
    onPlaybackError,
  };
  const hook = renderHook((props) => useAudioEngine(props), { initialProps: args });
  return { ...hook, audio, args, onPlaybackError };
}

it.each([3, 4])("stops ALAC decode error %s with a visible explanation", (code) => {
  const f = setup();
  Object.defineProperty(f.audio, "error", { value: { code, message: "decode failed" } });
  act(() => f.audio.dispatchEvent(new Event("error")));
  expect(f.result.current.playbackError).toContain("This browser can't play ALAC");
  expect(f.onPlaybackError).toHaveBeenCalledOnce();
  expect(f.audio.pause).toHaveBeenCalled();
  vi.mocked(f.audio.play).mockClear();
  act(() => f.audio.dispatchEvent(new Event("canplay")));
  expect(f.audio.play).not.toHaveBeenCalled();
});

it.each([null, "aac"])("uses a generic message for codec %s", (codec) => {
  const f = setup(codec);
  Object.defineProperty(f.audio, "error", { value: { code: 4 } });
  act(() => f.audio.dispatchEvent(new Event("error")));
  expect(f.result.current.playbackError).toContain("couldn't play this audio file");
});

it.each([1, 2, undefined])("does not blame ALAC for media error %s", (code) => {
  const f = setup();
  Object.defineProperty(f.audio, "error", { value: code ? { code } : null });
  act(() => f.audio.dispatchEvent(new Event("error")));
  expect(f.result.current.playbackError).toContain("couldn't play this audio file");
});

it.each(["NotSupportedError", "EncodingError"])("surfaces a rejected play: %s", async (name) => {
  const f = setup();
  vi.mocked(f.audio.play).mockRejectedValue({ name });
  await act(async () => f.audio.dispatchEvent(new Event("canplay")));
  expect(f.result.current.playbackError).toContain("can't play ALAC");
});

it.each(["AbortError", "NotAllowedError", null, { name: 4 }])(
  "does not turn an unrelated rejection into a decode error: %s",
  async (error) => {
    const f = setup();
    vi.mocked(f.audio.play).mockRejectedValue(typeof error === "string" ? { name: error } : error);
    await act(async () => f.audio.dispatchEvent(new Event("canplay")));
    expect(f.result.current.playbackError).toBeNull();
  },
);

it("ignores a rejected play for an old source", async () => {
  const f = setup();
  vi.mocked(f.audio.play).mockRejectedValue({ name: "NotSupportedError" });
  await act(async () => {
    f.audio.dispatchEvent(new Event("canplay"));
    f.audio.src = "/api/audio?filename=other.flac";
  });
  expect(f.onPlaybackError).not.toHaveBeenCalled();
});

it("retains the error while paused and clears it on retry or a different track", () => {
  const f = setup();
  act(() => f.audio.dispatchEvent(new Event("error")));
  f.rerender({ ...f.args, isPlaying: false });
  expect(f.result.current.playbackError).not.toBeNull();
  f.rerender(f.args);
  expect(f.result.current.playbackError).toBeNull();
  act(() => f.audio.dispatchEvent(new Event("error")));
  f.args.playlistRef.current = [
    { ...sampleTrack, track_id: "next", audio_codec: "flac", local_audio_url: "next.flac" },
  ];
  f.rerender({ ...f.args, isPlaying: false, plVersion: 1 });
  expect(f.result.current.playbackError).toBeNull();
  act(() => f.audio.dispatchEvent(new Event("error")));
  f.rerender({ ...f.args, currentTrackIndex: null, isPlaying: false });
  expect(f.result.current.playbackError).toBeNull();
});

it("handles an absent element and an empty queue", () => {
  const f = setup();
  f.args.audioRef.current = null;
  f.rerender({ ...f.args, plVersion: 1 });
  f.unmount();
  const empty = setup();
  empty.args.playlistRef.current = [];
  empty.rerender({ ...empty.args, plVersion: 1 });
  act(() => empty.audio.dispatchEvent(new Event("error")));
  expect(empty.result.current.playbackError).toContain("couldn't play");
});
