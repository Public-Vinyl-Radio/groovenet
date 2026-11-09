"use client";

import { useSyncExternalStore } from "react";

/** Chakra's `md` breakpoint: below it the app is laid out for a phone. */
const PHONE_QUERY = "(max-width: 767px)";

const subscribe = (notify: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

const snapshot = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches;

/** True below `md`. Server and first paint say false; the palette renders only when opened. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
