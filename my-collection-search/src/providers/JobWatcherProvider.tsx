"use client";

import React from "react";
import { useJobEventsSSE } from "@/hooks/useJobEventsSSE";

export function JobWatcherProvider({ children }: { children: React.ReactNode }) {
  // Watch for job completions via SSE and update all track caches + Zustand
  // store. Downloads are queued from album and search pages, so the watcher
  // runs everywhere: on a page that isn't listening, the store stays stale.
  useJobEventsSSE(true);

  return <>{children}</>;
}
