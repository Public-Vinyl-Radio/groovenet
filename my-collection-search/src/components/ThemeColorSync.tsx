"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useColorMode } from "@/components/ui/color-mode";

/**
 * The server renders `theme-color` per OS scheme, but light/dark can be
 * overridden per device. Point every theme-color tag at the ground actually
 * showing, so the iOS status bar matches the strip under it. The pathname is a
 * dependency because a navigation can make Next re-render the head's tags.
 */
export default function ThemeColorSync() {
  const { colorMode } = useColorMode();
  const pathname = usePathname();

  useEffect(() => {
    const ground = getComputedStyle(document.documentElement)
      .getPropertyValue("--gn-ground")
      .trim();
    if (!ground) return;
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", ground));
  }, [colorMode, pathname]);

  return null;
}
