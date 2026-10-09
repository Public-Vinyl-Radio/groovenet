"use client";

import { useEffect, useState } from "react";

export function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    ("standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function useStandaloneMode() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const update = () => setStandalone(isStandaloneMode());
    update();
    const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
    mediaQuery?.addEventListener?.("change", update);
    mediaQuery?.addListener?.(update);
    return () => {
      mediaQuery?.removeEventListener?.("change", update);
      mediaQuery?.removeListener?.(update);
    };
  }, []);

  return standalone;
}
