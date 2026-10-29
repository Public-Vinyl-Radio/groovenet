// @vitest-environment jsdom
import { it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAirPlay } from "@/providers/playlist-player/useAirPlay";

it("debug: event dispatch state update", () => {
  const audio = document.createElement("audio") as any;
  audio.webkitCurrentPlaybackTargetIsWireless = false;

  const { result } = renderHook(() => useAirPlay({ audioRef: { current: audio }, plVersion: 0 }));

  const before = result.current.isAirPlayAvailable;

  act(() => {
    const ev = Object.assign(new Event("webkitplaybacktargetavailabilitychanged"), {
      availability: "available",
    });
    audio.dispatchEvent(ev);
  });

  const after = result.current.isAirPlayAvailable;

  // just log for debugging
  expect({ before, after }).toMatchObject({ before: false });
});
