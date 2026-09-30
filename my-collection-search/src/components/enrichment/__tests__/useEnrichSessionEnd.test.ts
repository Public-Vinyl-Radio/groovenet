// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { setAnalyticsProvider } from "@/lib/analytics/client";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import { useEnrichSessionEnd, type Phase } from "../useEnrichSessionEnd";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

type Props = { phase: Phase; saved: number; skipped: number };

const render = (initial: Props) =>
  renderHook(({ phase, saved, skipped }: Props) => useEnrichSessionEnd(phase, 5, saved, skipped), {
    initialProps: initial,
  });

const sessionEnds = () =>
  analyticsEvents.events
    .filter((e) => e.event === "enrich_session_completed")
    .map((e) => e.properties);

describe("useEnrichSessionEnd", () => {
  beforeEach(() => analyticsEvents.reset());

  it("reports a finished session once, with its final counts", () => {
    const { rerender, unmount } = render({ phase: "enriching", saved: 0, skipped: 0 });
    rerender({ phase: "enriching", saved: 3, skipped: 1 });
    rerender({ phase: "done", saved: 4, skipped: 1 });
    unmount();

    expect(sessionEnds()).toEqual([
      { track_count: 5, tracks_saved: 4, tracks_skipped: 1, completed: true },
    ]);
  });

  it("reports a session left part-way as not completed, with the counts so far", () => {
    const { rerender, unmount } = render({ phase: "enriching", saved: 0, skipped: 0 });
    rerender({ phase: "enriching", saved: 2, skipped: 0 });
    unmount();

    expect(sessionEnds()).toEqual([
      { track_count: 5, tracks_saved: 2, tracks_skipped: 0, completed: false },
    ]);
  });

  it("reports nothing for a wizard closed before it started", () => {
    render({ phase: "setup", saved: 0, skipped: 0 }).unmount();
    expect(sessionEnds()).toEqual([]);
  });
});
