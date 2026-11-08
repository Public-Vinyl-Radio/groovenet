import { useEffect, useSyncExternalStore } from "react";

export type TabBarLabels = "always" | "selected" | "never";

export const TAB_BAR_LABELS: { value: TabBarLabels; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "selected", label: "Selected only" },
  { value: "never", label: "Never" },
];

export const TAB_BAR_LABELS_KEY = "tabbar-labels";
export const TAB_BAR_LABELS_ATTRIBUTE = "data-tabbar-labels";

const listeners = new Set<() => void>();
/** Set only while storage refuses writes, so the choice still holds this session. */
let unsaved: TabBarLabels | null = null;

export function isTabBarLabels(value: unknown): value is TabBarLabels {
  return TAB_BAR_LABELS.some((o) => o.value === value);
}

/** This device's choice; "always" when unset, invalid or storage is unavailable. */
export function readTabBarLabels(): TabBarLabels {
  try {
    const stored = localStorage.getItem(TAB_BAR_LABELS_KEY);
    return isTabBarLabels(stored) ? stored : "always";
  } catch {
    return "always";
  }
}

/** @internal for tests */
export function resetTabBarLabels() {
  unsaved = null;
}

export function writeTabBarLabels(value: TabBarLabels) {
  try {
    localStorage.setItem(TAB_BAR_LABELS_KEY, value);
    unsaved = null;
  } catch {
    // Private browsing or blocked storage: the choice lasts until reload.
    unsaved = value;
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): TabBarLabels {
  return unsaved ?? readTabBarLabels();
}

/** The current choice (server render and first client render use "always"). */
export function useTabBarLabels(): [TabBarLabels, (value: TabBarLabels) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => "always" as const);
  return [value, writeTabBarLabels];
}

/**
 * Mirror the choice onto <html data-tabbar-labels> so `--tabbar-h` follows it.
 * This runs after hydration, not in a pre-paint script, so a device set to
 * "never" can show one frame at the "always" height on first load.
 */
export function useTabBarLabelsFlag(value: TabBarLabels) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute(TAB_BAR_LABELS_ATTRIBUTE, value);
    return () => root.removeAttribute(TAB_BAR_LABELS_ATTRIBUTE);
  }, [value]);
}
