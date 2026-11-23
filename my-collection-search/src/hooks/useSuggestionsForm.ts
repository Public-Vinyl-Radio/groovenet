"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { TRACK_ROW_MID_MIN_WIDTH } from "@/components/TrackResult";

export type SuggestionsForm = "sheet" | "modal" | "panel";

/** The room the docked Suggestions panel needs before its titles and rows read well (#1233). */
export const SUGGESTIONS_PANEL_MIN_WIDTH = 400;
/** The gap between the list block and the docked panel. */
export const SUGGESTIONS_DOCK_GAP = 16;
/**
 * The container width from which the panel docks beside the list: the width at which the list
 * block keeps Release, Time, BPM / Key and Genre (`TRACK_ROW_MID_MIN_WIDTH`), plus the gap and the
 * panel's own minimum. Below it the list keeps the whole width and Suggestions open as a modal.
 * `TRACK_ROW_FULL_MIN_WIDTH` would also keep Rating, but it asks for 1456px, more than the page
 * container gives on any screen the owner works at.
 */
export const SUGGESTIONS_DOCK_MIN_WIDTH =
  Number.parseInt(TRACK_ROW_MID_MIN_WIDTH, 10) + SUGGESTIONS_DOCK_GAP + SUGGESTIONS_PANEL_MIN_WIDTH;

/** Chakra's `md` (48em): from here up phones' bottom sheet gives way to a modal or the panel. */
const MD_QUERY = "(min-width: 48em)";

export function suggestionsFormFor({
  phone,
  width,
}: {
  phone: boolean;
  width: number;
}): SuggestionsForm {
  if (phone) return "sheet";
  return width >= SUGGESTIONS_DOCK_MIN_WIDTH ? "panel" : "modal";
}

/**
 * Which form the Suggestions panel takes: a bottom sheet on phones, the docked sidebar when the
 * block holding the list and the panel (`containerRef`) is wide enough, a modal otherwise.
 *
 * It is `null` only until the layout effect has measured, which runs before the first paint, so
 * the panel never renders as one form and then flips to another (#1233). A container is measured,
 * not the viewport: the queue panel, the sidebar and the page gutters all take width from it.
 */
export function useSuggestionsForm(
  containerRef: RefObject<HTMLElement | null>,
): SuggestionsForm | null {
  const [form, setForm] = useState<SuggestionsForm | null>(null);

  useLayoutEffect(() => {
    const media = window.matchMedia(MD_QUERY);
    const decide = () => {
      const width = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      setForm(suggestionsFormFor({ phone: !media.matches, width }));
    };
    decide();
    const container = containerRef.current;
    const observer = new ResizeObserver(decide);
    if (container) observer.observe(container);
    media.addEventListener("change", decide);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", decide);
    };
  }, [containerRef]);

  return form;
}
