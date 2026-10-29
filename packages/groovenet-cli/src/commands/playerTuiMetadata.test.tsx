import React, { act } from "react";
import { Text } from "ink";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { GroovenetClient, Track } from "@groovenet/client";
import type { PlaybackSnapshot } from "@groovenet/player";
import { useQueueMetadata } from "./playerTuiMetadata.js";
import { PlayerTui } from "./playerTui.js";
import type { PlayerController } from "./remotePlayer.js";
import { forceTerminal } from "../tui/testing.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
beforeEach(() => forceTerminal(120, 40));
afterEach(() => {
  act(() => cleanup());
  vi.unstubAllEnvs();
});
const tick = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};
const ref: Track = {
  track_id: "coffee",
  friend_id: 6,
  title: "Coffee Bean",
  artist: "Travis Scott",
};
const full: Track = {
  ...ref,
  duration_seconds: 209,
  bpm: 132,
  key: "A minor",
  album: "Astroworld",
  album_thumbnail: "/cover.jpg",
};
const snapshot = (): PlaybackSnapshot => ({
  queue: [{ id: "entry", track: ref }],
  current: { id: "entry", track: ref },
  status: "playing",
  position: 21,
  duration: 209,
  volume: 45,
  error: null,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
};

it("hydrates queue/current metadata without changing playback state or refetching on position events", async () => {
  const batchGetTracks = vi.fn().mockResolvedValue([full]);
  const api = { batchGetTracks } as unknown as GroovenetClient;
  let result!: PlaybackSnapshot;
  function Probe({ value, remote = true }: { value: PlaybackSnapshot; remote?: boolean }) {
    result = useQueueMetadata(api, value, remote);
    return null;
  }
  const raw = snapshot();
  const app = render(<Probe value={raw} />);
  await tick();
  expect(batchGetTracks).toHaveBeenCalledWith([{ track_id: "coffee", friend_id: 6 }]);
  expect(result.current?.track).toEqual(full);
  expect(result.queue[0].track).toEqual(full);
  expect(result.position).toBe(21);
  expect(raw.current?.track).toBe(ref);
  app.rerender(
    <Probe value={{ ...raw, position: 22, queue: [{ ...raw.queue[0], track: { ...ref } }] }} />,
  );
  await tick();
  expect(result.position).toBe(22);
  expect(batchGetTracks).toHaveBeenCalledOnce();
  app.rerender(<Probe value={raw} remote={false} />);
  await tick();
  expect(result).toBe(raw);
});

it("keeps collection identities separate, loads additions only, and preserves missing tracks and null current", async () => {
  const other = { ...ref, friend_id: 9 };
  const batchGetTracks = vi.fn().mockResolvedValueOnce([full]).mockResolvedValueOnce([]);
  const api = { batchGetTracks } as unknown as GroovenetClient;
  let result!: PlaybackSnapshot;
  function Probe({ value }: { value: PlaybackSnapshot }) {
    result = useQueueMetadata(api, value, true);
    return null;
  }
  const raw = snapshot();
  const app = render(<Probe value={raw} />);
  await tick();
  app.rerender(
    <Probe
      value={{ ...raw, current: null, queue: [...raw.queue, { id: "other", track: other }] }}
    />,
  );
  await tick();
  expect(batchGetTracks).toHaveBeenLastCalledWith([{ track_id: "coffee", friend_id: 9 }]);
  expect(result.queue[1].track).toBe(other);
  expect(result.current).toBeNull();
});

it("contains lookup errors, retries after queue changes, and ignores completion after leaving the remote target", async () => {
  const pending = deferred<Track[]>();
  const batchGetTracks = vi
    .fn()
    .mockRejectedValueOnce(new Error("collection unavailable"))
    .mockReturnValueOnce(pending.promise);
  const api = { batchGetTracks } as unknown as GroovenetClient;
  let result!: PlaybackSnapshot;
  function Probe({ value, remote = true }: { value: PlaybackSnapshot; remote?: boolean }) {
    result = useQueueMetadata(api, value, remote);
    return null;
  }
  const raw = snapshot();
  const app = render(<Probe value={raw} />);
  await tick();
  expect(result.current?.track).toBe(ref);
  const changed = { ...raw, queue: [...raw.queue, { id: "duplicate", track: ref }] };
  app.rerender(<Probe value={changed} />);
  await tick();
  expect(batchGetTracks).toHaveBeenCalledTimes(2);
  app.rerender(<Probe value={raw} remote={false} />);
  await tick();
  await act(async () => pending.resolve([full]));
  await tick();
  expect(result).toBe(raw);
});

it.each(["blocks", "kitty"])(
  "renders remote Now Playing artwork and queue analysis with %s from ref-only entries",
  async (mode) => {
    vi.stubEnv("NO_COLOR", undefined);
    vi.stubEnv("GROOVENET_TUI_ART", mode);
    vi.stubEnv("COLORTERM", "truecolor");
    vi.stubEnv("TERM", "xterm-ghostty");
    vi.stubEnv("TMUX", undefined);
    vi.stubEnv("STY", undefined);
    vi.stubEnv("ZELLIJ", undefined);
    const probe = render(<Text />);
    const prototype = Object.getPrototypeOf(probe.stdout);
    Object.defineProperty(prototype, "isTTY", { configurable: true, value: true });
    act(() => probe.unmount());
    try {
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
        .png()
        .toBuffer();
      const batchGetTracks = vi.fn().mockResolvedValue([full]);
      const getArtwork = vi.fn().mockResolvedValue(png);
      const api = { batchGetTracks, getArtwork } as unknown as GroovenetClient;
      const raw = snapshot();
      const control = new EventEmitter() as PlayerController;
      control.request = vi.fn(async (method) =>
        method === "devices" ? [] : raw,
      ) as PlayerController["request"];
      control.close = vi.fn(async () => {});
      const app = render(
        <PlayerTui
          control={control}
          api={api}
          initialSnapshot={raw}
          options={{ remote: "lounge" }}
        />,
      );
      for (
        let i = 0;
        i < 20 && (!getArtwork.mock.calls.length || app.lastFrame()?.includes(" ART "));
        i++
      )
        await tick();
      expect(getArtwork).toHaveBeenCalledWith("/cover.jpg");
      expect(app.lastFrame()).toContain(mode === "kitty" ? "\u{10eeee}" : "▀▀▀▀");
      expect(app.lastFrame()).toContain("132 BPM · 8A");
      expect(app.lastFrame()).toMatch(/3:29\s+132\s+8A/);
      expect(app.lastFrame()).toContain("Astroworld");
      expect(batchGetTracks).toHaveBeenCalledOnce();
      act(() => app.unmount());
    } finally {
      delete prototype.isTTY;
    }
  },
);
