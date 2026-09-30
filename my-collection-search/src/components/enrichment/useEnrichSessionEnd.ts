import { useEffect, useRef } from "react";
import { analytics } from "@/lib/analytics/client";

export type Phase = "setup" | "enriching" | "done";

/**
 * Reports how an enrichment session ended: finished, or left part-way — by
 * Exit or by navigating away, which both unmount the wizard mid-session.
 */
export function useEnrichSessionEnd(phase: Phase, trackCount: number, saved: number, skipped: number) {
  const latest = useRef({ phase, trackCount, saved, skipped });
  const reported = useRef(false);

  useEffect(() => {
    latest.current = { phase, trackCount, saved, skipped };
    if (phase !== "done" || reported.current) return;
    reported.current = true;
    analytics.track("enrich_session_completed", {
      track_count: trackCount,
      tracks_saved: saved,
      tracks_skipped: skipped,
      completed: true,
    });
  }, [phase, trackCount, saved, skipped]);

  useEffect(
    () => () => {
      const session = latest.current;
      if (session.phase !== "enriching" || reported.current) return;
      reported.current = true;
      analytics.track("enrich_session_completed", {
        track_count: session.trackCount,
        tracks_saved: session.saved,
        tracks_skipped: session.skipped,
        completed: false,
      });
    },
    []
  );
}
