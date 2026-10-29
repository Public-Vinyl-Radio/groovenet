// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTrackStore } from "@/stores/trackStore";
import type { Track } from "@/types/track";
import { useJobEventsSSE } from "./useJobEventsSSE";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {}

  emit(data: string) {
    this.onmessage?.({ data });
  }
}

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const track: Track = {
  id: 1,
  track_id: "t1",
  friend_id: 1,
  title: "Terlingua",
  artist: "Artist",
  album: "LP-345",
  year: "2020",
  duration: "3:00",
  position: "A2",
  discogs_url: "",
  apple_music_url: "",
};

function emitJobCompleted(analysis: Record<string, unknown>) {
  const es = FakeEventSource.instances[0];
  act(() => {
    es.emit(
      JSON.stringify({
        type: "job_completed",
        job_id: "job-1",
        track_id: "t1",
        friend_id: 1,
        result: { analysis },
        timestamp: Date.now(),
      }),
    );
  });
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useTrackStore.getState().clearTracks();
  useTrackStore.getState().setTracks([track]);
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useJobEventsSSE key extraction (#524)", () => {
  it("stores the edma key and its confidence", async () => {
    renderHook(() => useJobEventsSSE(true), { wrapper });

    emitJobCompleted({
      tonal: { key_edma: { key: "F", scale: "major", strength: 0.62 } },
    });

    await waitFor(() => {
      const updated = useTrackStore.getState().getTrack("t1", 1);
      expect(updated?.key).toBe("F major");
      expect(updated?.key_confidence).toBe(0.62);
    });
  });

  it("logs a profile disagreement instead of silently discarding it", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useJobEventsSSE(true), { wrapper });

    emitJobCompleted({
      tonal: {
        key_edma: { key: "F", scale: "major", strength: 0.62 },
        key_krumhansl: { key: "C", scale: "major", strength: 0.58 },
      },
    });

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stored key=F major"));
    });
    warnSpy.mockRestore();
  });

  it("leaves key/key_confidence untouched when the job carries no tonal data", async () => {
    renderHook(() => useJobEventsSSE(true), { wrapper });

    emitJobCompleted({ rhythm: { bpm: 120 } });

    await waitFor(() => {
      expect(useTrackStore.getState().getTrack("t1", 1)?.bpm).toBe("120");
    });
    const updated = useTrackStore.getState().getTrack("t1", 1);
    expect(updated?.key).toBeUndefined();
    expect(updated?.key_confidence).toBeUndefined();
  });
});

describe("useJobEventsSSE bpm confidence (#531)", () => {
  it("stores the beat-histogram margin alongside the bpm", async () => {
    renderHook(() => useJobEventsSSE(true), { wrapper });

    emitJobCompleted({
      rhythm: {
        bpm: 103.48,
        bpm_histogram_first_peak_weight: 0.282,
        bpm_histogram_second_peak_weight: 0.024,
      },
    });

    await waitFor(() => {
      const updated = useTrackStore.getState().getTrack("t1", 1);
      expect(updated?.bpm).toBe("103");
      expect(updated?.bpm_confidence).toBe(0.258);
    });
  });

  it("leaves bpm_confidence untouched when the histogram is missing", async () => {
    renderHook(() => useJobEventsSSE(true), { wrapper });

    emitJobCompleted({ rhythm: { bpm: 120 } });

    await waitFor(() => {
      expect(useTrackStore.getState().getTrack("t1", 1)?.bpm).toBe("120");
    });
    expect(useTrackStore.getState().getTrack("t1", 1)?.bpm_confidence).toBeUndefined();
  });
});
