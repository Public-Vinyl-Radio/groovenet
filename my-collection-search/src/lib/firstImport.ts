// The first import's "what next" checklist (#1246) is per device: it appears once an import
// was started from an empty library on this device, and goes away when dismissed. Storage can
// be missing or throw (private window, blocked site data), so every access is guarded and the
// checklist simply doesn't show.

const KEY = "gn:first-import";

export type FirstImportFlag = "pending" | "dismissed";

export function readFirstImportFlag(): FirstImportFlag | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "pending" || value === "dismissed" ? value : null;
  } catch {
    return null;
  }
}

export function writeFirstImportFlag(value: FirstImportFlag): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // ignore storage errors
  }
}
