// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { player } from "@/test/serverPlayerFixtures";

vi.mock("@/providers/PlaylistPlayerProvider", () => ({
  usePlaylistPlayerTime: () => ({ currentTime: 7, duration: 70 }),
}));
const target = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/providers/PlaybackTargetProvider", () => ({
  useOptionalPlaybackTarget: () => target.value,
}));

import { usePlayerTime } from "@/components/player/usePlayerTime";

const on = (patch: Partial<ReturnType<typeof player>["state"]> | null) => {
  const p = player();
  target.value = {
    target: "lounge",
    remote: { player: patch === null ? null : { ...p, state: { ...p.state, ...patch } } },
  };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  target.value = null;
});

describe("usePlayerTime", () => {
  it("is this browser's time without a server", () => {
    expect(renderHook(usePlayerTime).result.current).toEqual({ currentTime: 7, duration: 70 });
    target.value = { target: "" };
    expect(renderHook(usePlayerTime).result.current).toEqual({ currentTime: 7, duration: 70 });
  });

  it("is zero before a snapshot, or with no current entry", () => {
    on(null);
    expect(renderHook(usePlayerTime).result.current).toEqual({ currentTime: 0, duration: 0 });
    on({ current_entry_id: null });
    expect(renderHook(usePlayerTime).result.current).toEqual({ currentTime: 0, duration: 0 });
  });

  it("holds a paused position, and runs on locally while playing, up to the duration", () => {
    on({ status: "paused", position: 12 });
    const paused = renderHook(usePlayerTime);
    act(() => vi.advanceTimersByTime(3000));
    expect(paused.result.current).toEqual({ currentTime: 12, duration: 100 });

    on({ status: "playing", position: 98 });
    const playing = renderHook(usePlayerTime);
    act(() => vi.advanceTimersByTime(1000));
    expect(playing.result.current.currentTime).toBeCloseTo(99, 0);
    act(() => vi.advanceTimersByTime(5000));
    expect(playing.result.current.currentTime).toBe(100);
  });

  it("counts on without a cap when the duration is unknown", () => {
    on({ status: "playing", position: 5, duration: null });
    const { result } = renderHook(usePlayerTime);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.duration).toBe(0);
    expect(result.current.currentTime).toBeGreaterThanOrEqual(6.5);
  });
});
