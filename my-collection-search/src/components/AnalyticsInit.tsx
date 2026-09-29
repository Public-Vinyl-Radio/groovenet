"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics/client";
import type { ClientAnalyticsConfig } from "@/lib/analytics/types";

// Rendered first in <body> so its effect runs before any other component's,
// and nothing tracks against the noop provider by accident.
export default function AnalyticsInit({ config }: { config: ClientAnalyticsConfig }) {
  useEffect(() => {
    initAnalytics(config);
  }, [config]);
  return null;
}
