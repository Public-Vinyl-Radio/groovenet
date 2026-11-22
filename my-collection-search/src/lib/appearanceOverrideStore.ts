// This device's appearance override, in localStorage behind a tiny external
// store. Storage can be absent, blocked or corrupt: every access is in a
// try/catch, a failed read is the empty override, and a failed write keeps the
// change in memory for the life of the page, so the picker still works.
import {
  appearanceOverrideKey,
  emptyOverride,
  isEmptyOverride,
  mergeOverride,
  parseAppearanceOverride,
  serializeOverride,
  type AppearanceOverride,
  type AppearanceOverridePatch,
} from "@/app/appearanceOverride";

let current: AppearanceOverride | null = null;
const listeners = new Set<() => void>();

function readStored(): AppearanceOverride {
  try {
    return parseAppearanceOverride(window.localStorage.getItem(appearanceOverrideKey));
  } catch {
    return emptyOverride;
  }
}

function writeStored(override: AppearanceOverride) {
  try {
    if (isEmptyOverride(override)) window.localStorage.removeItem(appearanceOverrideKey);
    else window.localStorage.setItem(appearanceOverrideKey, serializeOverride(override));
  } catch {
    // Blocked or full: the override lives in memory until the page closes.
  }
}

const notify = () => listeners.forEach((listener) => listener());

/** The current override. Stable between changes, as `useSyncExternalStore` needs. */
export function getAppearanceOverride(): AppearanceOverride {
  current ??= readStored();
  return current;
}

/** Re-read storage (another tab wrote, or a test reset it) and tell subscribers. */
export function reloadAppearanceOverride() {
  current = readStored();
  notify();
}

/** Apply a change: null clears a field, omitted fields stay. */
export function updateAppearanceOverride(patch: AppearanceOverridePatch) {
  current = mergeOverride(getAppearanceOverride(), patch);
  writeStored(current);
  notify();
}

/** Clear every field: this device follows the saved setting again. */
export function resetAppearanceOverride() {
  current = emptyOverride;
  writeStored(current);
  notify();
}

/**
 * Rewrite the stored record from its validated form: it drops invalid fields
 * and refreshes the custom palette's derived CSS the pre-paint script reads.
 */
export function refreshStoredAppearanceOverride() {
  const override = getAppearanceOverride();
  if (!isEmptyOverride(override)) writeStored(override);
}

export function subscribeAppearanceOverride(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // A null key is `localStorage.clear()` in another tab.
    if (event.key === null || event.key === appearanceOverrideKey) reloadAppearanceOverride();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const getServerAppearanceOverride = () => emptyOverride;
