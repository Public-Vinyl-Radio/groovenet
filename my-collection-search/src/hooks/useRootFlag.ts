"use client";

import { useEffect } from "react";

/**
 * Mirror a boolean onto <html> as a `data-*` attribute while `on` is true, so
 * global CSS (the shell's `--player-h` / `--tabbar-h` vars) can react to state
 * that lives in React.
 */
export function useRootFlag(attribute: `data-${string}`, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.setAttribute(attribute, "");
    return () => root.removeAttribute(attribute);
  }, [attribute, on]);
}
