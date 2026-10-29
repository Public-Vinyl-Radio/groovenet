import { useSyncExternalStore } from "react";

type NavigatorLike = { userAgent: string; maxTouchPoints?: number };

/** "This iPhone", "This Mac": how the Play on picker names the device you're holding. */
export function deviceLabel(nav: NavigatorLike | undefined): string {
  if (!nav) return "This device";
  const ua = nav.userAgent;
  if (/iPhone|iPod/.test(ua)) return "This iPhone";
  // iPadOS reports a desktop Mac user agent; touch support gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1))
    return "This iPad";
  if (/Macintosh|Mac OS X/.test(ua)) return "This Mac";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "This phone" : "This tablet";
  if (/Windows|CrOS|Linux/.test(ua)) return "This computer";
  return "This device";
}

const subscribe = () => () => {};
/** `deviceLabel` for the current browser; "This device" while server rendering. */
export function useDeviceLabel(): string {
  return useSyncExternalStore(
    subscribe,
    () => deviceLabel(typeof navigator === "undefined" ? undefined : navigator),
    () => "This device",
  );
}
