// Lightweight dev logger for client-side debugging.
// Enable via:
// - Env: NEXT_PUBLIC_DEBUG_STORE=true
// - Runtime: localStorage.setItem('debug:store', '1')

const STYLE_SCOPE = "color:#8b5cf6;font-weight:bold";
const STYLE_TIME = "color:#64748b";
const STYLE_LABEL = "color:#22c55e";

export const isStoreDebugEnabled = (): boolean => {
  try {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem("debug:store");
      if (v === "1" || v === "true") return true;
    }
    // Note: process.env.* is replaced at build-time in Next.js, safe for client usage
    if (
      process.env.NEXT_PUBLIC_DEBUG_STORE === "1" ||
      process.env.NEXT_PUBLIC_DEBUG_STORE === "true"
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
};

export const enableStoreDebug = (on: boolean) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("debug:store", on ? "1" : "0");
  }
};

type LogEntry = [label: string, value: unknown];

export const storeLog = (action: string, entries: LogEntry[] = []) => {
  if (!isStoreDebugEnabled()) return;
  const time = new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
  // Grouped, collapsible log for clarity
  try {
    console.groupCollapsed(`%cTrackStore%c ${action} %c${time}`, STYLE_SCOPE, "", STYLE_TIME);
    for (const [label, value] of entries) {
      console.log(`%c${label}:`, STYLE_LABEL, value);
    }
  } finally {
    console.groupEnd?.();
  }
};

export const diffObjectKeys = (
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
) => {
  const changes: Record<string, { from: unknown; to: unknown } | "added" | "removed"> = {};
  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  for (const k of keys) {
    const b = before?.[k];
    const a = after?.[k];
    if (b === undefined && a !== undefined) {
      changes[k] = "added";
    } else if (b !== undefined && a === undefined) {
      changes[k] = "removed";
    } else if (b !== a) {
      changes[k] = { from: b, to: a };
    }
  }
  return changes;
};
